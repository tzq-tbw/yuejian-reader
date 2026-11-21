import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Bookmark,
  Languages,
  RefreshCw,
  TextQuote,
  Trash2,
} from "lucide-react";
import type {
  LongSentenceFavorite,
  ReaderApi,
  WordFavorite,
} from "../data/types";
import type { LanguageService, ReadingTarget } from "../language/types";
import { AnalysisSections } from "../components/AnalysisSections";
import { errorMessage } from "../utils/error";
import {
  hasAnalysisContent,
  packAnalysis,
  parseStoredAnalysis,
} from "./analysis";
import { localDateKey } from "../review/schedule";

interface CollectionPageProps {
  api: ReaderApi;
  language: LanguageService;
  onOpenArticle: (
    articleId: number,
    paragraphStart: number,
    paragraphEnd: number,
  ) => void;
  notify: (text: string, kind?: "info" | "error") => void;
}

type Tab = "words" | "sentences";

function rangeLabel(start: number, end: number): string {
  return start === end ? `第 ${start + 1} 段` : `第 ${start + 1}–${end + 1} 段`;
}

function historicalTarget(
  item: LongSentenceFavorite,
  operation: "translate" | "parse",
): ReadingTarget {
  const paragraphs: number[] = [];
  for (let index = item.paragraphStart; index <= item.paragraphEnd; index += 1) {
    paragraphs.push(index);
  }
  return {
    articleId: item.articleId ?? 0,
    version: 0,
    operation,
    start: { paragraph: item.paragraphStart, offset: 0 },
    end: { paragraph: item.paragraphEnd, offset: item.sourceText.length },
    paragraphs,
    text: item.sourceText,
  };
}

export function CollectionPage({
  api,
  language,
  onOpenArticle,
  notify,
}: CollectionPageProps) {
  const [tab, setTab] = useState<Tab>("words");
  const [words, setWords] = useState<WordFavorite[]>([]);
  const [sentences, setSentences] = useState<LongSentenceFavorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [filling, setFilling] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextWords, nextSentences] = await Promise.all([
        api.listWordFavorites(localDateKey()),
        api.listLongSentenceFavorites(),
      ]);
      setWords(nextWords);
      setSentences(nextSentences);
    } catch (cause) {
      notify(`加载收藏失败：${errorMessage(cause)}`, "error");
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

  async function removeWord(item: WordFavorite) {
    if (!window.confirm(`从生词本移除「${item.word}」？`)) return;
    try {
      await api.removeWordFavorite(item.id);
      await refresh();
      notify(`已从生词本移除「${item.word}」，复习队列同步更新`);
    } catch (cause) {
      notify(`移除失败：${errorMessage(cause)}`, "error");
    }
  }

  async function removeSentence(item: LongSentenceFavorite) {
    if (!window.confirm("从长难句本移除这条？")) return;
    try {
      await api.removeLongSentenceFavorite(item.id);
      await refresh();
      notify("已从长难句本移除");
    } catch (cause) {
      notify(`移除失败：${errorMessage(cause)}`, "error");
    }
  }

  async function fill(
    item: LongSentenceFavorite,
    kind: "translation" | "analysis",
  ) {
    const key = `${item.id}:${kind}`;
    if (filling) return;
    setFilling(key);
    try {
      const paragraphs = [{ index: item.paragraphStart, text: item.sourceText }];
      if (kind === "translation") {
        const result = await language.translate({
          target: historicalTarget(item, "translate"),
          text: item.sourceText,
          paragraphs,
          articleTitle: item.articleTitle,
        });
        await api.fillLongSentenceFavorite({
          id: item.id,
          translation: result.translation,
        });
        notify("已补全译文");
      } else {
        const result = await language.analyze({
          target: historicalTarget(item, "parse"),
          text: item.sourceText,
          paragraphs,
          articleTitle: item.articleTitle,
        });
        await api.fillLongSentenceFavorite({
          id: item.id,
          analysis: packAnalysis(result),
        });
        notify("已补全解析");
      }
      await refresh();
    } catch (cause) {
      notify(`补全失败：${errorMessage(cause)}`, "error");
    } finally {
      setFilling(null);
    }
  }

  const wordTotal = words.length;
  const sentenceTotal = sentences.length;

  return (
    <div className="libraryMain collectionMain">
      <div className="libTop">
        <h1>收藏</h1>
        <span className="pageNote">
          {wordTotal} 条词语 · {sentenceTotal} 条长难句 · 原文快照保存在本机
        </span>
        <button
          type="button"
          className="ghostButton"
          aria-label="刷新收藏"
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      <div className="collectTabs" role="tablist" aria-label="收藏分类">
        <button
          type="button"
          role="tab"
          id="collection-tab-words"
          aria-selected={tab === "words"}
          aria-controls="collection-panel"
          className={tab === "words" ? "selected" : ""}
          onClick={() => setTab("words")}
        >
          <Bookmark size={15} /> 生词本 <em>{wordTotal}</em>
        </button>
        <button
          type="button"
          role="tab"
          id="collection-tab-sentences"
          aria-selected={tab === "sentences"}
          aria-controls="collection-panel"
          className={tab === "sentences" ? "selected" : ""}
          onClick={() => setTab("sentences")}
        >
          <TextQuote size={15} /> 长难句本 <em>{sentenceTotal}</em>
        </button>
      </div>

      <div className="libScroll">
        <div
          className="libInner collectInner"
          id="collection-panel"
          role="tabpanel"
          aria-labelledby={
            tab === "words" ? "collection-tab-words" : "collection-tab-sentences"
          }
        >
          {loading ? (
            <div className="busy">正在加载收藏…</div>
          ) : tab === "words" ? (
            words.length === 0 ? (
              <div className="libEmpty collectionEmpty">
                <Bookmark size={34} />
                <h2>生词本还是空的</h2>
                <p>
                  在精读侧栏查看词卡后点「收藏词语」，或收藏短语翻译。
                  同词同句重复收藏只保留一条。
                </p>
              </div>
            ) : (
              <div className="collectList">
                {words.map((item) => (
                  <article
                    className="collectItem"
                    key={item.id}
                    aria-label={`词语收藏：${item.word}`}
                  >
                    <div className="collectHead">
                      <h2>{item.word}</h2>
                      <span className="collectBadge">
                        下次复习 {item.dueDate ?? "待排程"}
                      </span>
                    </div>
                    <div className="collectMetaLine">
                      来源：{item.articleTitle} · {rangeLabel(item.paragraphStart, item.paragraphEnd)}
                      {item.forgottenCount > 0 &&
                        ` · 历史忘记 ${item.forgottenCount} 次`}
                    </div>
                    <blockquote className="selectionQuote">{item.sentence}</blockquote>
                    <div className="collectMetaLine">
                      {`规范化词形：${item.normalizedWord} · 规范化原句：${item.normalizedSentence}`}
                    </div>
                    <div className="collectMeaning">
                      <span className="fieldLabel">语境义</span>
                      <p>{item.contextualMeaning || "—"}</p>
                      <span className="fieldLabel">常见义</span>
                      <p>{item.commonMeaning || "—"}</p>
                      {item.forms.length > 0 && (
                        <>
                          <span className="fieldLabel">词形</span>
                          <p className="wordForms">{item.forms.join("；")}</p>
                        </>
                      )}
                    </div>
                    <div className="collectFoot">
                      <button
                        type="button"
                        disabled={item.articleId === null}
                        onClick={() =>
                          item.articleId !== null &&
                          onOpenArticle(
                            item.articleId,
                            item.paragraphStart,
                            item.paragraphEnd,
                          )
                        }
                      >
                        <BookOpen size={14} /> 回看原文
                      </button>
                      <button
                        type="button"
                        className="danger"
                        aria-label={`移除词语 ${item.word}`}
                        onClick={() => void removeWord(item)}
                      >
                        <Trash2 size={14} /> 移除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : sentences.length === 0 ? (
            <div className="libEmpty collectionEmpty">
              <TextQuote size={34} />
              <h2>长难句本还是空的</h2>
              <p>
                在正文中选中一个完整单句，点「收藏长难句」；多句或整段会先确认。
                收藏时缺少译文或解析也会先保存，标出可补全项。
              </p>
            </div>
          ) : (
            <div className="collectList">
              {sentences.map((item) => {
                const analysis = parseStoredAnalysis(item.analysis);
                const analysisReady = hasAnalysisContent(analysis);
                return (
                  <article
                    className="collectItem"
                    key={item.id}
                    aria-label={`长难句收藏：${item.sourceText.slice(0, 24)}`}
                  >
                    <div className="collectHead">
                      <h2 className="sentenceHeading">长难句</h2>
                      <span className="collectMetaLine">
                        {item.articleTitle} · {rangeLabel(item.paragraphStart, item.paragraphEnd)}
                      </span>
                    </div>
                    <blockquote className="selectionQuote">{item.sourceText}</blockquote>

                    <span className="fieldLabel">译文</span>
                    {item.translation ? (
                      <p className="translationText">{item.translation}</p>
                    ) : (
                      <div className="missingRow">
                        <span className="collectBadge warn">译文待补全</span>
                        <button
                          type="button"
                          disabled={filling !== null}
                          onClick={() => void fill(item, "translation")}
                        >
                          <Languages size={14} />
                          {filling === `${item.id}:translation` ? "生成中…" : "补全译文"}
                        </button>
                      </div>
                    )}

                    <span className="fieldLabel">解析</span>
                    {analysisReady ? (
                      <div className="collectAnalysis">
                        <AnalysisSections result={analysis} />
                      </div>
                    ) : (
                      <div className="missingRow">
                        <span className="collectBadge warn">解析待补全</span>
                        <button
                          type="button"
                          disabled={filling !== null}
                          onClick={() => void fill(item, "analysis")}
                        >
                          <TextQuote size={14} />
                          {filling === `${item.id}:analysis` ? "生成中…" : "补全解析"}
                        </button>
                      </div>
                    )}

                    <div className="collectFoot">
                      <button
                        type="button"
                        disabled={item.articleId === null}
                        onClick={() =>
                          item.articleId !== null &&
                          onOpenArticle(
                            item.articleId,
                            item.paragraphStart,
                            item.paragraphEnd,
                          )
                        }
                      >
                        <BookOpen size={14} /> 回看原文
                      </button>
                      <button
                        type="button"
                        className="danger"
                        aria-label="移除这条长难句"
                        onClick={() => void removeSentence(item)}
                      >
                        <Trash2 size={14} /> 移除
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}