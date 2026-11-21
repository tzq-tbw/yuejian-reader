import { useEffect, useId, useRef, useState } from "react";
import { FileUp, ListChecks, TriangleAlert } from "lucide-react";
import type { ImportSuiteInput, ImportSuiteResult, ReaderApi } from "../data/types";
import { paragraphsToText, parsePastedText } from "../data/text";
import { errorMessage } from "../utils/error";
import { Modal } from "../components/Modal";
import { sha256Hex } from "./fingerprint";
import { analyzeReadingDocument } from "./split";
import type { CandidateArticle, QuestionArea } from "./types";

interface PdfImportDialogProps {
  api: ReaderApi;
  file: File | null;
  onClose: () => void;
  onImported: (result: ImportSuiteResult) => Promise<void> | void;
  onRetryPick: () => void;
  returnFocus?: HTMLElement | null;
}

interface CardDraft extends CandidateArticle {
  text: string;
}

type Stage = "reading" | "preview" | "importing" | "error";

function defaultSuiteTitle(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, "").trim();
  return base || "导入的试卷";
}

function questionAreaLabel(area: QuestionArea): string {
  switch (area.kind) {
    case "banked_cloze":
      return `空位 ${area.blanks.length} 个 · 候选词 ${area.wordBank.length} 个`;
    case "matching":
      return `陈述 ${area.statements.length} 条 · 段落 ${area.paragraphLetters.length} 个`;
    case "multiple_choice":
      return `${area.questions.length} 题`;
    default:
      return "题目区未识别";
  }
}

function QuestionAreaPreview({ area }: { area: QuestionArea }) {
  if (area.kind === "raw") {
    return <p className="importRaw">题目区未识别，正文按原文保留，请在导入前校对。</p>;
  }
  if (area.kind === "banked_cloze") {
    return (
      <div>
        <p className="importAreaLine">
          空位题号：{area.blanks.length ? area.blanks.join("、") : "未识别"}
        </p>
        <div className="importWordBank" aria-label="候选词表">
          {area.wordBank.map((entry) => (
            <span key={entry.letter}>
              <b>{entry.letter})</b> {entry.word}
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (area.kind === "matching") {
    return (
      <div>
        <p className="importAreaLine">
          段落字母：{area.paragraphLetters.length ? area.paragraphLetters.join("") : "未识别"}
        </p>
        <ul className="importStatements">
          {area.statements.map((statement) => (
            <li key={statement.number}>
              <b>{statement.number}.</b> {statement.text}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="importQuestions">
      {area.questions.map((question) => (
        <div className="importQuestion" key={question.number}>
          <p>
            <b>{question.number}.</b> {question.stem}
          </p>
          <ul>
            {question.options.map((option) => (
              <li key={option.letter}>
                <b>{option.letter})</b> {option.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ImportCard({
  card,
  index,
  disabled,
  onChange,
}: {
  card: CardDraft;
  index: number;
  disabled: boolean;
  onChange: (next: CardDraft) => void;
}) {
  const [open, setOpen] = useState(index === 0);
  const id = useId();
  const paragraphCount = parsePastedText(card.text).length;

  return (
    <details
      className="importCard"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="importType">{card.examType}</span>
        <span className="importTitle">{card.title}</span>
        <span className="importMeta">
          {card.pageRange ? `第 ${card.pageRange} 页` : "页码未识别"}
          {card.questionRange ? ` · 题 ${card.questionRange}` : " · 题号未识别"}
          {` · ${paragraphCount} 段 · ${questionAreaLabel(card.questionArea)}`}
        </span>
        {card.warnings.length > 0 && (
          <span className="importWarnBadge">
            <TriangleAlert size={13} /> {card.warnings.length} 条校对提示
          </span>
        )}
      </summary>
      <div className="importCardBody">
        {card.warnings.map((warning) => (
          <p className="importWarning" key={warning}>
            {warning}
          </p>
        ))}
        <label htmlFor={`${id}-title`}>标题</label>
        <input
          id={`${id}-title`}
          type="text"
          value={card.title}
          disabled={disabled}
          onChange={(event) => onChange({ ...card, title: event.target.value })}
        />
        <label htmlFor={`${id}-body`}>正文（空行分段，题目区不写入正文）</label>
        <textarea
          id={`${id}-body`}
          className="importBody"
          value={card.text}
          disabled={disabled}
          spellCheck={false}
          lang="en"
          onChange={(event) => onChange({ ...card, text: event.target.value })}
        />
        <div className="importArea">
          <div className="importAreaHead">
            <ListChecks size={15} /> 随篇题目区
          </div>
          <QuestionAreaPreview area={card.questionArea} />
        </div>
      </div>
    </details>
  );
}

/**
 * PDF 导入只有一个入口：先提取文字层，再按 Section/Passage/题号拆篇，
 * 校对后把一套卷的全部阅读卡一次事务入库。
 */
export function PdfImportDialog({
  api,
  file,
  onClose,
  onImported,
  onRetryPick,
  returnFocus,
}: PdfImportDialogProps) {
  const [stage, setStage] = useState<Stage>("reading");
  const [suiteTitle, setSuiteTitle] = useState("");
  const [cards, setCards] = useState<CardDraft[]>([]);
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const bufferRef = useRef<ArrayBuffer | null>(null);

  useEffect(() => {
    if (!file) {
      setStage("reading");
      setSuiteTitle("");
      setCards([]);
      setAnalysisWarnings([]);
      setPageCount(0);
      setProgress({ done: 0, total: 0 });
      setError("");
      bufferRef.current = null;
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setStage("reading");
    setError("");
    setCards([]);
    setAnalysisWarnings([]);
    setPageCount(0);
    setProgress({ done: 0, total: 0 });
    bufferRef.current = null;

    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        if (cancelled || controller.signal.aborted) return;
        bufferRef.current = buffer.slice(0);
        const { extractPdf } = await import("./pdf");
        const doc = await extractPdf(buffer, {
          signal: controller.signal,
          onProgress: (done, total) => {
            if (!cancelled) setProgress({ done, total });
          },
        });
        if (cancelled || controller.signal.aborted) return;
        const analysis = analyzeReadingDocument(doc);
        setPageCount(doc.pageCount);
        setSuiteTitle(defaultSuiteTitle(file.name));
        setCards(
          analysis.articles.map((article) => ({
            ...article,
            text: paragraphsToText(article.paragraphs),
          })),
        );
        setAnalysisWarnings(analysis.warnings);
        setStage("preview");
      } catch (cause) {
        if (cancelled || controller.signal.aborted) return;
        setError(errorMessage(cause));
        setStage("error");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [file]);

  function close() {
    if (stage === "importing") return;
    onClose();
  }

  async function submit() {
    if (!file || !bufferRef.current) return;
    const properTitle = suiteTitle.trim();
    if (!properTitle) {
      setError("套卷名称不能为空");
      return;
    }
    for (let index = 0; index < cards.length; index += 1) {
      if (!cards[index].title.trim()) {
        setError(`第 ${index + 1} 张卡的标题不能为空`);
        return;
      }
      if (!parsePastedText(cards[index].text).length) {
        setError(`第 ${index + 1} 张卡的正文不能为空`);
        return;
      }
    }
    if (!cards.length) {
      setError("没有可导入的阅读卡");
      return;
    }

    setError("");
    setStage("importing");
    try {
      const fingerprint = await sha256Hex(bufferRef.current);
      const input: ImportSuiteInput = {
        title: properTitle,
        fingerprint,
        examLevel: properTitle.includes("四级")
          ? "四级"
          : properTitle.includes("六级")
            ? "六级"
            : null,
        articles: cards.map((card) => ({
          title: card.title.trim(),
          examType: card.examType,
          sequenceNo: card.sequenceNo,
          pageRange: card.pageRange || null,
          questionRange: card.questionRange || null,
          questionArea: JSON.stringify(card.questionArea),
          paragraphs: parsePastedText(card.text),
        })),
      };
      const result = await api.importSuite(input);
      await onImported(result);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
      setStage("preview");
    }
  }

  const busy = stage === "importing";

  return (
    <Modal
      open={file !== null}
      title="导入 PDF 真题"
      onClose={close}
      wide
      returnFocus={returnFocus}
    >
      {stage === "reading" && (
        <div role="status">
          <p className="busy">
            正在提取 PDF 文字层…
            {progress.total ? `（第 ${progress.done}/${progress.total} 页）` : ""}
          </p>
          <p className="sub">
            只读取每页的文字和坐标；取消不会写入任何数据。
          </p>
          <div className="actions">
            <button type="button" onClick={close}>
              取消
            </button>
          </div>
        </div>
      )}

      {stage === "error" && (
        <div>
          <div className="error" role="alert">
            {error}
          </div>
          <p className="sub">可以重新选择另一个 PDF，或取消后重试。</p>
          <div className="actions">
            <button type="button" onClick={close}>
              取消
            </button>
            <button type="button" className="primary" onClick={onRetryPick}>
              <FileUp size={14} /> 重新选择文件
            </button>
          </div>
        </div>
      )}

      {(stage === "preview" || stage === "importing") && (
        <div>
          <p className="sub">
            已提取 {pageCount} 页文字，按 Section / Passage / 题号拆成{" "}
            <b>{cards.length}</b> 张阅读卡。请展开卡片核对正文和题目区；导入后仍可在资料库编辑。
          </p>
          {analysisWarnings.length > 0 && (
            <ul className="importWarnings" aria-label="整体校对提示">
              {analysisWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <label htmlFor="import-suite-title">套卷名称</label>
          <input
            id="import-suite-title"
            type="text"
            data-autofocus
            value={suiteTitle}
            disabled={busy}
            onChange={(event) => setSuiteTitle(event.target.value)}
          />
          <div className="importCards">
            {cards.map((card, index) => (
              <ImportCard
                key={card.sequenceNo}
                card={card}
                index={index}
                disabled={busy}
                onChange={(next) =>
                  setCards((previous) =>
                    previous.map((item, itemIndex) => (itemIndex === index ? next : item)),
                  )
                }
              />
            ))}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="actions">
            <button type="button" onClick={close} disabled={busy}>
              取消
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void submit()}
              disabled={busy || !cards.length}
            >
              {busy ? "导入中…" : `导入 ${cards.length} 篇`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}