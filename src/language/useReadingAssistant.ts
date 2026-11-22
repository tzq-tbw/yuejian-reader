import { useEffect, useRef, useState } from "react";
import type { ArticleDetail } from "../data/types";
import { errorMessage } from "../utils/error";
import { createLanguageService } from "./service";
import { sentenceAt } from "./text";
import { articleTarget, paragraphTarget, sameSelectionRange, selectionTarget } from "./targets";
import type {
  AssistantResult,
  LanguageService,
  ReadingOperation,
  ReadingTarget,
  SelectionInput,
  TranslationResult,
  TranslationRow,
} from "./types";

export interface AssistantPending {
  operation: ReadingOperation;
  label: string;
}

export interface AssistantError {
  message: string;
  retry: () => void;
}

export interface AssistantState {
  /** 结果所属的文章与正文版本；切换文章/版本后立即隐藏旧结果。 */
  key: string | null;
  /** 上一次成功结果；新请求完成前一直保留。 */
  result: AssistantResult | null;
  pending: AssistantPending | null;
  error: AssistantError | null;
}

interface ParagraphRetrySnapshot {
  seq: number;
  key: string;
  row: TranslationRow;
}

export interface ReadingAssistant {
  result: AssistantResult | null;
  pending: AssistantPending | null;
  error: AssistantError | null;
  askWord(selection: SelectionInput): void;
  translateSelection(selection: SelectionInput): void;
  analyzeSelection(selection: SelectionInput): void;
  translateParagraph(index: number): void;
  translateArticle(): void;
  retryParagraph(index: number): void;
}

function withoutRowLoading(result: AssistantResult | null): AssistantResult | null {
  if (!result || result.kind !== "translation" || !result.rows) return result;
  if (!result.rows.some((row) => row.loading)) return result;
  return {
    ...result,
    rows: result.rows.map((row) => (row.loading ? { ...row, loading: false } : row)),
  };
}

function messageOf(cause: unknown): string {
  return errorMessage(cause);
}

function identityOf(article: ArticleDetail | null): string | null {
  return article ? `${article.id}:${article.version}` : null;
}

/**
 * 精读侧栏会话。
 *
 * 迟到响应隔离：
 * - 每个请求创建递增序号，并携带文章 ID、正文版本、选区起止与操作类别；
 * - 返回时序号必须仍是当前序号，且文章 ID/版本与发起时一致；
 * - 新请求开始时保留上一次结果，只有成功响应才替换。
 */
export function useReadingAssistant(
  article: ArticleDetail | null,
  languageService?: LanguageService,
): ReadingAssistant {
  const [builtinService] = useState(() => createLanguageService());
  const service = languageService ?? builtinService;
  const serviceRef = useRef(service);
  const articleRef = useRef(article);
  // 同步保存“当前值”，确保同步 resolve 的测试桩也按最新文章核对。
  serviceRef.current = service;
  articleRef.current = article;

  const currentKey = identityOf(article);
  const [state, setState] = useState<AssistantState>({
    key: currentKey,
    result: null,
    pending: null,
    error: null,
  });
  const seqRef = useRef(0);
  const resultRef = useRef<AssistantResult | null>(null);
  const paragraphRetryRef = useRef<ParagraphRetrySnapshot | null>(null);
  const identityRef = useRef(currentKey);
  if (identityRef.current !== currentKey) {
    // 切换文章/版本时立刻丢弃旧结果，不等副作用执行。
    identityRef.current = currentKey;
    resultRef.current = null;
    paragraphRetryRef.current = null;
  }

  function restoreInterruptedParagraphRetry(): void {
    const snapshot = paragraphRetryRef.current;
    if (!snapshot) return;
    paragraphRetryRef.current = null;

    const latest = resultRef.current;
    if (
      !latest ||
      latest.kind !== "translation" ||
      latest.mode !== "article" ||
      !latest.rows ||
      `${latest.target.articleId}:${latest.target.version}` !== snapshot.key
    ) {
      return;
    }
    let restored = false;
    const next: TranslationResult = {
      ...latest,
      rows: latest.rows.map((row) => {
        if (row.paragraph !== snapshot.row.paragraph || !row.loading) return row;
        restored = true;
        return { ...snapshot.row, loading: false };
      }),
    };
    if (!restored) return;
    resultRef.current = next;
    setState((previous) =>
      previous.key === snapshot.key ? { ...previous, result: next } : previous,
    );
  }

  function isCurrent(seq: number, target: ReadingTarget): boolean {
    const current = articleRef.current;
    return (
      seq === seqRef.current &&
      current !== null &&
      current.id === target.articleId &&
      current.version === target.version
    );
  }

  function execute<T extends AssistantResult>(
    operation: ReadingOperation,
    label: string,
    target: ReadingTarget,
    load: () => Promise<T>,
  ): void {
    const current = articleRef.current;
    if (
      !current ||
      current.id !== target.articleId ||
      current.version !== target.version
    ) {
      return;
    }
    restoreInterruptedParagraphRetry();
    const seq = ++seqRef.current;
    const key = `${target.articleId}:${target.version}`;
    setState((previous) => ({
      key,
      result: previous.key === key ? withoutRowLoading(previous.result) : null,
      pending: { operation, label },
      error: null,
    }));

    const retry = () => execute(operation, label, target, load);
    load().then(
      (result) => {
        if (!isCurrent(seq, target)) return;
        resultRef.current = result;
        setState({ key, result, pending: null, error: null });
      },
      (cause: unknown) => {
        if (!isCurrent(seq, target)) return;
        setState((previous) => ({
          key,
          result: previous.key === key ? previous.result : null,
          pending: null,
          error: { message: messageOf(cause), retry },
        }));
      },
    );
  }

  function askWord(selection: SelectionInput): void {
    const current = articleRef.current;
    const word = selection.text.trim();
    if (!current || !word) return;
    const paragraph =
      current.paragraphs[selection.start.paragraph] ??
      selection.paragraphs[0]?.text ??
      word;
    const sentence = sentenceAt(paragraph, selection.start.offset);
    const target = selectionTarget(current, "word", selection);
    execute("word", `词卡 · ${word}`, target, () =>
      serviceRef.current.wordCard({
        target,
        word,
        sentence,
        paragraph,
        articleTitle: current.title,
      }),
    );
  }

  function translateSelection(selection: SelectionInput): void {
    const current = articleRef.current;
    if (!current || !selection.text.trim()) return;
    const target = selectionTarget(current, "translate", selection);
    execute("translate", "翻译选区", target, () =>
      serviceRef.current.translate({
        target,
        text: selection.text,
        paragraphs: selection.paragraphs,
        articleTitle: current.title,
      }),
    );
  }

  function analyzeSelection(selection: SelectionInput): void {
    const current = articleRef.current;
    if (!current || !selection.text.trim()) return;
    const target = selectionTarget(current, "parse", selection);
    const existing = resultRef.current;
    const appendToTranslation =
      existing !== null &&
      existing.kind === "translation" &&
      existing.mode === "selection" &&
      sameSelectionRange(existing.target, target);

    const request = () =>
      serviceRef.current.analyze({
        target,
        text: selection.text,
        paragraphs: selection.paragraphs,
        articleTitle: current.title,
      });

    if (appendToTranslation) {
      const base = existing;
      // 翻译结果保留在原处，解析成功后在同一个侧栏结果下追加。
      execute("parse", "解析选区", target, async () => ({
        ...base,
        analysis: await request(),
      }));
    } else {
      execute("parse", "解析选区", target, request);
    }
  }

  function translateParagraph(index: number): void {
    const current = articleRef.current;
    if (!current) return;
    const text = current.paragraphs[index];
    if (text === undefined) return;
    const target = paragraphTarget(current, index);
    execute("paragraph", `第 ${index + 1} 段翻译`, target, () =>
      serviceRef.current.translate({
        target,
        text,
        paragraphs: [{ index, text }],
        articleTitle: current.title,
      }),
    );
  }

  function translateArticle(): void {
    const current = articleRef.current;
    if (!current || !current.paragraphs.length) return;
    const articleToTranslate = current;
    const target = articleTarget(articleToTranslate);
    const key = `${target.articleId}:${target.version}`;
    restoreInterruptedParagraphRetry();
    const seq = ++seqRef.current;
    setState((previous) => ({
      key,
      result: previous.key === key ? withoutRowLoading(previous.result) : null,
      pending: { operation: "article", label: "全文翻译" },
      error: null,
    }));

    const retry = () => translateArticle();
    const rows: TranslationRow[] = articleToTranslate.paragraphs.map((text, index) => ({
      paragraph: index,
      source: text,
      translation: "",
      error: null,
      loading: true,
    }));
    let nextIndex = 0;
    async function worker() {
      while (isCurrent(seq, target)) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= articleToTranslate.paragraphs.length) return;
        const text = articleToTranslate.paragraphs[index];
        const paragraph = paragraphTarget(articleToTranslate, index);
        try {
          const response = await serviceRef.current.translate({
            target: paragraph,
            text,
            paragraphs: [{ index, text }],
            articleTitle: articleToTranslate.title,
          });
          rows[index] = {
            paragraph: index,
            source: text,
            translation: response.translation,
            error: null,
            loading: false,
          };
        } catch (cause) {
          rows[index] = {
            paragraph: index,
            source: text,
            translation: "",
            error: messageOf(cause),
            loading: false,
          };
        }
      }
    }

    Promise.all(
      Array.from({ length: Math.min(3, articleToTranslate.paragraphs.length) }, () => worker()),
    ).then(() => {
      if (!isCurrent(seq, target)) return;
      const failures = rows.filter((row) => row.error !== null);
      if (failures.length === rows.length) {
        setState((previous) => ({
          key,
          result: previous.key === key ? previous.result : null,
          pending: null,
          error: {
            message: `全文翻译失败：${failures[0]?.error ?? "未知错误"}`,
            retry,
          },
        }));
        return;
      }
      const result: TranslationResult = {
        kind: "translation",
        target,
        mode: "article",
        source: articleToTranslate.paragraphs.join("\n\n"),
        translation: "",
        rows,
      };
      resultRef.current = result;
      setState({ key, result, pending: null, error: null });
    });
  }

  function retryParagraph(index: number): void {
    restoreInterruptedParagraphRetry();
    const current = articleRef.current;
    const existing = resultRef.current;
    if (!current || !existing) return;

    if (
      existing.kind === "translation" &&
      existing.mode === "paragraph" &&
      existing.target.start.paragraph === index
    ) {
      translateParagraph(index);
      return;
    }
    if (
      existing.kind !== "translation" ||
      existing.mode !== "article" ||
      !existing.rows
    ) {
      return;
    }
    const text = current.paragraphs[index];
    if (text === undefined) return;

    const seq = ++seqRef.current;
    const target = paragraphTarget(current, index);
    const row = existing.rows.find((item) => item.paragraph === index);
    if (!row) return;
    paragraphRetryRef.current = {
      seq,
      key: `${existing.target.articleId}:${existing.target.version}`,
      row: { ...row },
    };
    const loadingResult: TranslationResult = {
      ...existing,
      rows: existing.rows.map((row) =>
        row.paragraph === index
          ? { ...row, error: null, loading: true }
          : row,
      ),
    };
    resultRef.current = loadingResult;
    setState((previous) => ({
      ...previous,
      result: loadingResult,
      error: null,
    }));

    const resultArticleId = existing.target.articleId;
    const resultVersion = existing.target.version;
    function matchesCurrent(): boolean {
      const latest = articleRef.current;
      return (
        seq === seqRef.current &&
        latest !== null &&
        latest.id === resultArticleId &&
        latest.version === resultVersion
      );
    }

    serviceRef.current
      .translate({
        target,
        text,
        paragraphs: [{ index, text }],
        articleTitle: current.title,
      })
      .then(
        (response) => {
          if (!matchesCurrent()) return;
          if (paragraphRetryRef.current?.seq === seq) {
            paragraphRetryRef.current = null;
          }
          const latest = resultRef.current;
          if (
            !latest ||
            latest.kind !== "translation" ||
            latest.mode !== "article" ||
            !latest.rows
          ) {
            return;
          }
          const next: TranslationResult = {
            ...latest,
            rows: latest.rows.map((row) =>
              row.paragraph === index
                ? {
                    ...row,
                    translation: response.translation,
                    error: null,
                    loading: false,
                  }
                : row,
            ),
          };
          resultRef.current = next;
          setState((previous) => ({ ...previous, result: next }));
        },
        (cause: unknown) => {
          if (!matchesCurrent()) return;
          if (paragraphRetryRef.current?.seq === seq) {
            paragraphRetryRef.current = null;
          }
          const latest = resultRef.current;
          if (
            !latest ||
            latest.kind !== "translation" ||
            latest.mode !== "article" ||
            !latest.rows
          ) {
            return;
          }
          const next: TranslationResult = {
            ...latest,
            rows: latest.rows.map((row) =>
              row.paragraph === index
                ? { ...row, error: messageOf(cause), loading: false }
                : row,
            ),
          };
          resultRef.current = next;
          setState((previous) => ({ ...previous, result: next }));
        },
      );
  }

  useEffect(() => {
    seqRef.current += 1;
    resultRef.current = null;
    paragraphRetryRef.current = null;
    setState({
      key: identityOf(article),
      result: null,
      pending: null,
      error: null,
    });
  }, [article?.id, article?.version]);

  const visible =
    state.key === currentKey
      ? state
      : { key: currentKey, result: null, pending: null, error: null };

  return {
    result: visible.result,
    pending: visible.pending,
    error: visible.error,
    askWord,
    translateSelection,
    analyzeSelection,
    translateParagraph,
    translateArticle,
    retryParagraph,
  };
}