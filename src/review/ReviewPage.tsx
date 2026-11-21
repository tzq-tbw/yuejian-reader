import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  RefreshCw,
  Sparkles,
  TextQuote,
} from "lucide-react";
import type {
  LongSentenceFavorite,
  ReaderApi,
  ReviewRating,
  WordFavorite,
} from "../data/types";
import type { LanguageService } from "../language/types";
import { AnalysisSections } from "../components/AnalysisSections";
import { errorMessage } from "../utils/error";
import { hasAnalysisContent, parseStoredAnalysis } from "../collection/analysis";
import {
  createReviewCoach,
  type ReviewCoach,
  type ReviewFocusWord,
} from "./coach";
import { localDateKey } from "./schedule";

interface ReviewPageProps {
  api: ReaderApi;
  /** 保留注入入口，供后续在复习窗口补全长难句内容。 */
  language?: LanguageService;
  coach?: ReviewCoach;
  getToday?: () => string;
  onOpenArticle: (
    articleId: number,
    paragraphStart: number,
    paragraphEnd: number,
  ) => void;
  notify: (text: string, kind?: "info" | "error") => void;
}

function rangeLabel(start: number, end: number): string {
  return start === end ? `第 ${start + 1} 段` : `第 ${start + 1}–${end + 1} 段`;
}

function WordReviewWindow({
  api,
  coach,
  getToday,
  onOpenArticle,
  notify,
}: {
  api: ReaderApi;
  coach: ReviewCoach;
  getToday: () => string;
  onOpenArticle: (
    articleId: number,
    paragraphStart: number,
    paragraphEnd: number,
  ) => void;
  notify: (text: string, kind?: "info" | "error") => void;
}) {
  const [today, setToday] = useState(getToday);
  const [due, setDue] = useState<WordFavorite[]>([]);
  const [queue, setQueue] = useState<WordFavorite[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [rememberedCount, setRememberedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [focusWords, setFocusWords] = useState<ReviewFocusWord[] | null>(null);
  const [focusError, setFocusError] = useState("");
  const [focusLoading, setFocusLoading] = useState(false);
  const loadedRef = useRef(false);
  const activeDateRef = useRef(today);
  const inFlightRef = useRef(false);
  const revealSeqRef = useRef(0);
  const seenRef = useRef<Set<number>>(new Set());
  const roundRef = useRef(
    `round-${today}-${Math.random().toString(36).slice(2, 10)}`,
  );

  useEffect(() => {
    activeDateRef.current = today;
    loadedRef.current = false;
    seenRef.current = new Set();
    revealSeqRef.current = 0;
    roundRef.current = `round-${today}-${Math.random().toString(36).slice(2, 10)}`;
    setDue([]);
    setQueue([]);
    setTotal(0);
    setRememberedCount(0);
    setRevealed(false);
    setRevealId(null);
    setFocusWords(null);
    setFocusError("");
    setLoading(true);
  }, [today]);

  const refresh = useCallback(async () => {
    try {
      const [cards, allFavorites] = await Promise.all([
        api.listDueWordFavorites(today),
        api.listWordFavorites(today),
      ]);
      if (activeDateRef.current !== today) return;
      const existing = new Set(allFavorites.map((card) => card.id));
      if (!loadedRef.current) {
        seenRef.current = new Set(cards.map((card) => card.id));
      } else {
        for (const card of cards) seenRef.current.add(card.id);
        // 本轮已记得的卡已被移出到期集，但仍在生词本里，需要保留在今日总数中；
        // 被删除的收藏已不在生词本，今日总数应同步减少。
        for (const id of [...seenRef.current]) {
          if (!existing.has(id)) seenRef.current.delete(id);
        }
      }
      setDue(cards);
      setQueue((previous) => {
        if (!loadedRef.current || previous.length === 0) return cards;
        const ids = new Set(cards.map((card) => card.id));
        return previous.filter((card) => ids.has(card.id));
      });
      setTotal(seenRef.current.size);
      loadedRef.current = true;
    } catch (cause) {
      notify(`加载到期词卡失败：${errorMessage(cause)}`, "error");
    } finally {
      setLoading(false);
    }
  }, [api, notify, today]);

  const refreshCurrentDay = useCallback(() => {
    const nextToday = getToday();
    if (nextToday !== today) setToday(nextToday);
    else void refresh();
  }, [getToday, refresh, today]);

  useEffect(() => {
    void refresh();
    const onFocus = () => refreshCurrentDay();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, refreshCurrentDay]);

  const current = queue[0] ?? null;
  const currentId = current?.id ?? null;

  // 队列切换或被外部删除后，下一次必须重新揭晓，不能沿用上一张的答案状态。
  useEffect(() => {
    setRevealed(false);
    setRevealId(null);
  }, [currentId]);

  function reveal() {
    if (!current || revealed) return;
    revealSeqRef.current += 1;
    setRevealId(
      `${roundRef.current}:${current.id}:${revealSeqRef.current}`,
    );
    setRevealed(true);
  }

  async function rate(rating: ReviewRating) {
    if (!current || !revealId || inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    try {
      await api.recordReviewEvent({
        favoriteId: current.id,
        roundId: roundRef.current,
        revealId,
        rating,
        localDate: today,
      });
      setRevealed(false);
      setRevealId(null);
      if (rating === "remembered") {
        setRememberedCount((count) => count + 1);
        setQueue((previous) => previous.slice(1));
      } else {
        setQueue((previous) =>
          previous.length > 1
            ? [
                ...previous.slice(1),
                {
                  ...previous[0],
                  forgottenToday: true,
                  forgottenCount: previous[0].forgottenCount + 1,
                },
              ]
            : [
                {
                  ...previous[0],
                  forgottenToday: true,
                  forgottenCount: previous[0].forgottenCount + 1,
                },
              ],
        );
      }
    } catch (cause) {
      notify(`记录评分失败：${errorMessage(cause)}`, "error");
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }

  async function suggestFocus() {
    if (focusLoading || due.length === 0) return;
    setFocusLoading(true);
    setFocusError("");
    try {
      const words = await coach.suggestFocus(due);
      setFocusWords(words);
    } catch (cause) {
      setFocusWords(null);
      setFocusError(errorMessage(cause));
    } finally {
      setFocusLoading(false);
    }
  }

  const historyForgets = due.reduce(
    (sum, card) => sum + card.forgottenCount,
    0,
  );

  return (
    <section className="reviewWindow" aria-label="词语复习窗口">
      <div className="reviewHead">
        <div>
          <h2>词语复习</h2>
          <p className="reviewStats" role="status">
            今日 {total} 张 · 待复习 {queue.length} 张 · 本轮记得{" "}
            {rememberedCount} 张
          </p>
        </div>
        <button
          type="button"
          className="ghostButton"
          aria-label="刷新词语复习"
          onClick={refreshCurrentDay}
        >
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      <div className={`reviewReminder${total === 0 ? " done" : ""}`}>
        {total === 0
          ? "今日没有到期词卡，已完成。"
          : `今天有 ${total} 张词卡到期（含逾期）。忘记的卡会排到本轮队尾；今日数量按卡去重。`}
      </div>

      <div className="aiFocus">
        <div className="aiFocusHead">
          <Sparkles size={15} />
          <b>AI 重点词</b>
          <span>从到期词指出近期易忘词</span>
          <button
            type="button"
            disabled={focusLoading || due.length === 0}
            onClick={() => void suggestFocus()}
          >
            {focusLoading ? "分析中…" : "生成提醒"}
          </button>
        </div>
        {focusWords && focusWords.length > 0 && (
          <ul className="focusList">
            {focusWords.map((item) => (
              <li key={item.word}>
                <b>{item.word}</b>
                <span>{item.reason || "近期易忘"}</span>
              </li>
            ))}
          </ul>
        )}
        {focusWords && focusWords.length === 0 && (
          <p className="aiFocusNote">AI 没有指出额外的易忘词。</p>
        )}
        {focusError && (
          <p className="aiFocusNote warn" role="alert">
            无法获取 AI 提醒：{focusError}。可按到期量与历史忘记次数继续复习：
            今日到期 {total} 张，历史累计忘记 {historyForgets} 次。
          </p>
        )}
      </div>

      {loading ? (
        <div className="busy">正在加载到期词卡…</div>
      ) : current ? (
        <article className="reviewCard" aria-label="当前词语卡">
          <div className="reviewCardTop">
            <span className="collectBadge">待复习 {queue.length} 张</span>
            <span>
              {current.articleTitle} ·{" "}
              {rangeLabel(current.paragraphStart, current.paragraphEnd)}
            </span>
          </div>
          <h3 className="reviewWord">{current.word}</h3>
          <blockquote className="selectionQuote">{current.sentence}</blockquote>
          {current.forgottenCount > 0 && (
            <p className="reviewForgetNote">
              历史忘记 {current.forgottenCount} 次
            </p>
          )}

          {!revealed ? (
            <button type="button" className="primary reviewReveal" onClick={reveal}>
              揭晓
            </button>
          ) : (
            <>
              <div className="reviewAnswer">
                <span className="fieldLabel">语境义</span>
                <p className="reviewMeaning">
                  {current.contextualMeaning || "—"}
                </p>
                <span className="fieldLabel">常见义</span>
                <p>{current.commonMeaning || "—"}</p>
                {current.forms.length > 0 && (
                  <>
                    <span className="fieldLabel">词形</span>
                    <p className="wordForms">{current.forms.join("；")}</p>
                  </>
                )}
              </div>
              <div className="ratingButtons">
                <button
                  type="button"
                  className="remember"
                  disabled={busy}
                  onClick={() => void rate("remembered")}
                >
                  记得
                </button>
                <button
                  type="button"
                  className="forgot"
                  disabled={busy}
                  onClick={() => void rate("forgotten")}
                >
                  忘了
                </button>
              </div>
            </>
          )}

          <div className="collectFoot">
            <button
              type="button"
              disabled={current.articleId === null}
              onClick={() =>
                current.articleId !== null &&
                onOpenArticle(
                  current.articleId,
                  current.paragraphStart,
                  current.paragraphEnd,
                )
              }
            >
              <BookOpen size={14} /> 回看原文
            </button>
          </div>
        </article>
      ) : (
        <div className="libEmpty reviewEmpty">
          <CalendarCheck size={34} />
          <h2>{total === 0 ? "今日已完成" : "本轮已完成"}</h2>
          <p>
            今天没有到期词卡。收藏的新词会在次日首次出现，逾期词卡会并入下一次复习。
          </p>
        </div>
      )}
    </section>
  );
}

function LongSentenceReviewWindow({
  api,
  onOpenArticle,
  notify,
}: {
  api: ReaderApi;
  onOpenArticle: (
    articleId: number,
    paragraphStart: number,
    paragraphEnd: number,
  ) => void;
  notify: (text: string, kind?: "info" | "error") => void;
}) {
  const [items, setItems] = useState<LongSentenceFavorite[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await api.listLongSentenceFavorites();
      setItems(next);
      setIndex((previous) =>
        Math.min(previous, Math.max(0, next.length - 1)),
      );
    } catch (cause) {
      notify(`加载长难句失败：${errorMessage(cause)}`, "error");
    } finally {
      setLoading(false);
    }
  }, [api, notify]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const current = items[index] ?? null;
  const currentId = current?.id ?? null;
  useEffect(() => {
    setRevealed(false);
  }, [currentId]);
  const analysis = useMemo(
    () => parseStoredAnalysis(current?.analysis),
    [current?.analysis],
  );
  const analysisReady = hasAnalysisContent(analysis);

  function move(delta: number) {
    setIndex((previous) =>
      Math.min(Math.max(previous + delta, 0), Math.max(0, items.length - 1)),
    );
    setRevealed(false);
  }

  return (
    <section className="reviewWindow" aria-label="长难句复习窗口">
      <div className="reviewHead">
        <div>
          <h2>长难句复习</h2>
          <p className="reviewStats" role="status">
            共 {items.length} 条 · 按需复习，不分组、不参与日期排程
          </p>
        </div>
        <button
          type="button"
          className="ghostButton"
          aria-label="刷新长难句复习"
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      {loading ? (
        <div className="busy">正在加载长难句…</div>
      ) : current ? (
        <article className="reviewCard" aria-label="当前长难句">
          <div className="reviewCardTop">
            <span className="collectBadge">
              第 {index + 1} / {items.length} 条
            </span>
            <span>
              {current.articleTitle} ·{" "}
              {rangeLabel(current.paragraphStart, current.paragraphEnd)}
            </span>
          </div>
          <blockquote className="selectionQuote reviewSentence">
            {current.sourceText}
          </blockquote>

          {!revealed ? (
            <button
              type="button"
              className="primary reviewReveal"
              onClick={() => setRevealed(true)}
            >
              揭晓译文与解析
            </button>
          ) : (
            <div className="reviewAnswer">
              <span className="fieldLabel">译文</span>
              {current.translation ? (
                <p className="translationText">{current.translation}</p>
              ) : (
                <div className="missingRow">
                  <span className="collectBadge warn">译文待补全</span>
                  <span className="fieldHint">可在收藏页联网补全</span>
                </div>
              )}
              <span className="fieldLabel">解析</span>
              {analysisReady ? (
                <AnalysisSections result={analysis} />
              ) : (
                <div className="missingRow">
                  <span className="collectBadge warn">解析待补全</span>
                  <span className="fieldHint">可在收藏页联网补全</span>
                </div>
              )}
            </div>
          )}

          <div className="sentenceNav">
            <button
              type="button"
              disabled={index <= 0}
              onClick={() => move(-1)}
            >
              <ArrowLeft size={14} /> 上一条
            </button>
            <button
              type="button"
              disabled={index >= items.length - 1}
              onClick={() => move(1)}
            >
              下一条 <ArrowRight size={14} />
            </button>
            <button
              type="button"
              disabled={current.articleId === null}
              onClick={() =>
                current.articleId !== null &&
                onOpenArticle(
                  current.articleId,
                  current.paragraphStart,
                  current.paragraphEnd,
                )
              }
            >
              <BookOpen size={14} /> 回看原文
            </button>
          </div>
        </article>
      ) : (
        <div className="libEmpty reviewEmpty">
          <TextQuote size={34} />
          <h2>长难句本还是空的</h2>
          <p>
            在正文中选中完整单句并收藏后，这里按加入顺序逐条复习。
            先显示原文，揭晓后显示译文和解析。
          </p>
        </div>
      )}
    </section>
  );
}

export function ReviewPage({
  api,
  coach,
  getToday = localDateKey,
  onOpenArticle,
  notify,
}: ReviewPageProps) {
  const [tab, setTab] = useState<"words" | "sentences">("words");
  const [builtinCoach] = useState(() => createReviewCoach());
  const resolvedCoach = coach ?? builtinCoach;

  return (
    <div className="libraryMain reviewMain">
      <div className="libTop">
        <h1>复习</h1>
        <span className="pageNote">
          按本机日历日取到期词卡 · 长难句按需复习
        </span>
      </div>

      <div className="collectTabs" role="tablist" aria-label="复习窗口">
        <button
          type="button"
          role="tab"
          id="review-tab-words"
          aria-selected={tab === "words"}
          aria-controls="review-panel"
          className={tab === "words" ? "selected" : ""}
          onClick={() => setTab("words")}
        >
          <CalendarCheck size={15} /> 词语复习
        </button>
        <button
          type="button"
          role="tab"
          id="review-tab-sentences"
          aria-selected={tab === "sentences"}
          aria-controls="review-panel"
          className={tab === "sentences" ? "selected" : ""}
          onClick={() => setTab("sentences")}
        >
          <TextQuote size={15} /> 长难句复习
        </button>
      </div>

      <div className="libScroll">
        <div
          className="libInner reviewInner"
          id="review-panel"
          role="tabpanel"
          aria-labelledby={tab === "words" ? "review-tab-words" : "review-tab-sentences"}
        >
          {tab === "words" ? (
            <WordReviewWindow
              api={api}
              coach={resolvedCoach}
              getToday={getToday}
              onOpenArticle={onOpenArticle}
              notify={notify}
            />
          ) : (
            <LongSentenceReviewWindow
              api={api}
              onOpenArticle={onOpenArticle}
              notify={notify}
            />
          )}
        </div>
      </div>
    </div>
  );
}