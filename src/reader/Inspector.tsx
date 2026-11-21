import { useState } from "react";
import {
  BookMarked,
  Languages,
  PanelRightClose,
  TextQuote,
} from "lucide-react";
import type { ArticleDetail } from "../data/types";
import type {
  AnalysisResult,
  TranslationResult,
  WordCard,
} from "../language/types";
import type { ReadingAssistant } from "../language/useReadingAssistant";
import { sentenceAt } from "../language/text";
import { IconButton } from "../components/IconButton";
import { AnalysisSections } from "../components/AnalysisSections";
import { isPhraseSelection } from "../collection/sentence";
import type {
  CollectLongSentenceInput,
  CollectOutcome,
  CollectWordInput,
} from "../collection/types";

interface InspectorProps {
  assistant: ReadingAssistant;
  article: ArticleDetail | null;
  onCollectWord: (input: CollectWordInput) => Promise<CollectOutcome>;
  onCollectLongSentence: (
    input: CollectLongSentenceInput,
  ) => Promise<CollectOutcome>;
  onCollapse: () => void;
}

function CollectAction({
  label,
  successLabel = "已收藏",
  onCollect,
}: {
  label: string;
  successLabel?: string;
  onCollect: () => Promise<CollectOutcome>;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <button type="button" className="collectAction done" disabled>
        <BookMarked size={14} /> {successLabel}
      </button>
    );
  }
  return (
    <button
      type="button"
      className="collectAction"
      disabled={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          const outcome = await onCollect();
          if (outcome === "created" || outcome === "existing") setDone(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <BookMarked size={14} /> {busy ? "收藏中…" : label}
    </button>
  );
}

function WordCardView({
  card,
  onCollectWord,
}: {
  card: WordCard;
  onCollectWord: (input: CollectWordInput) => Promise<CollectOutcome>;
}) {
  const meta = [card.phonetic, card.partOfSpeech].filter(Boolean).join(" · ");
  return (
    <>
      <div className="kicker">
        <BookMarked size={16} />
        词语释义
      </div>
      <h2>{card.word}</h2>
      {meta && <div className="wordmeta">{meta}</div>}
      <label>原句</label>
      <blockquote className="selectionQuote">{card.sentence}</blockquote>
      <label>语境义</label>
      <h3>{card.contextualMeaning}</h3>
      <label>常见义</label>
      <p>{card.commonMeaning}</p>
      {card.forms.length > 0 && (
        <>
          <label>词形</label>
          <p className="wordForms">{card.forms.join("；")}</p>
        </>
      )}
      <div className="collectActionRow">
        <CollectAction
          key={`${card.target.articleId}:${card.target.start.paragraph}:${card.target.end.paragraph}:${card.word}:${card.sentence}`}
          label="收藏词语"
          onCollect={() =>
            onCollectWord({
              word: card.word,
              sentence: card.sentence,
              contextualMeaning: card.contextualMeaning,
              commonMeaning: card.commonMeaning,
              phonetic: card.phonetic,
              partOfSpeech: card.partOfSpeech,
              forms: card.forms,
              articleId: card.target.articleId,
              paragraphStart: card.target.start.paragraph,
              paragraphEnd: card.target.end.paragraph,
            })
          }
        />
      </div>
    </>
  );
}

function TranslationView({
  result,
  article,
  onRetryParagraph,
  onCollectWord,
  onCollectLongSentence,
}: {
  result: TranslationResult;
  article: ArticleDetail | null;
  onRetryParagraph: (index: number) => void;
  onCollectWord: (input: CollectWordInput) => Promise<CollectOutcome>;
  onCollectLongSentence: (
    input: CollectLongSentenceInput,
  ) => Promise<CollectOutcome>;
}) {
  if (result.mode === "article" && result.rows) {
    return (
      <>
        <div className="kicker">
          <Languages size={16} />
          全文翻译
        </div>
        {result.rows.map((row) => (
          <div className="translationRow" key={row.paragraph}>
            <label>第 {row.paragraph + 1} 段</label>
            <p className="rowSource" lang="en">
              {row.source}
            </p>
            {row.loading ? (
              <p className="rowStatus" role="status">
                正在重新翻译本段…
              </p>
            ) : row.error ? (
              <div className="rowError" role="alert">
                <span>本段翻译失败：{row.error}</span>
                <button
                  type="button"
                  onClick={() => onRetryParagraph(row.paragraph)}
                >
                  重试本段
                </button>
              </div>
            ) : row.translation ? (
              <>
                <p className="translationText">{row.translation}</p>
                <div className="rowCollect">
                  <CollectAction
                    key={`${result.target.articleId}:${row.paragraph}:${row.source}`}
                    label="收藏本段"
                    onCollect={() =>
                      onCollectLongSentence({
                        sourceText: row.source,
                        translation: row.translation,
                        analysis: null,
                        articleId: result.target.articleId,
                        paragraphStart: row.paragraph,
                        paragraphEnd: row.paragraph,
                        wholeParagraph: true,
                      })
                    }
                  />
                </div>
              </>
            ) : (
              <div className="rowError" role="alert">
                <span>本段暂无译文，请重试。</span>
                <button
                  type="button"
                  onClick={() => onRetryParagraph(row.paragraph)}
                >
                  重试本段
                </button>
              </div>
            )}
          </div>
        ))}
      </>
    );
  }

  const phrase = isPhraseSelection(
    result.source,
    result.target.start.paragraph,
    result.target.end.paragraph,
  );
  const collectPhrase = () => {
    const paragraph =
      article?.paragraphs[result.target.start.paragraph] ?? result.source;
    const sentence =
      sentenceAt(paragraph, result.target.start.offset) || result.source;
    return onCollectWord({
      word: result.source.trim(),
      sentence,
      contextualMeaning: result.translation,
      commonMeaning: "",
      articleId: result.target.articleId,
      paragraphStart: result.target.start.paragraph,
      paragraphEnd: result.target.end.paragraph,
    });
  };
  const collectLongSentence = () =>
    onCollectLongSentence({
      sourceText: result.source,
      translation: result.translation,
      analysis: result.analysis ?? null,
      articleId: result.target.articleId,
      paragraphStart: result.target.start.paragraph,
      paragraphEnd: result.target.end.paragraph,
      wholeParagraph: result.mode === "paragraph",
    });

  return (
    <>
      <div className="kicker">
        <Languages size={16} />
        {result.mode === "paragraph" ? "段落翻译" : "译文"}
      </div>
      <label>原文</label>
      <blockquote className="selectionQuote">{result.source}</blockquote>
      <label>译文</label>
      <p className="translationText">{result.translation}</p>
      {result.analysis && (
        <>
          <hr />
          <div className="kicker">
            <TextQuote size={16} />
            语法解析
          </div>
          <AnalysisSections result={result.analysis} />
        </>
      )}
      <div className="collectActionRow">
        {phrase ? (
          <CollectAction
            key={`${result.target.articleId}:${result.source}:${result.translation}`}
            label="收藏短语"
            successLabel="已收藏短语"
            onCollect={collectPhrase}
          />
        ) : (
          <CollectAction
            key={`${result.target.articleId}:${result.source}:${result.translation}`}
            label="收藏长难句"
            onCollect={collectLongSentence}
          />
        )}
      </div>
    </>
  );
}

function AnalysisView({
  result,
  onCollectLongSentence,
}: {
  result: AnalysisResult;
  onCollectLongSentence: (
    input: CollectLongSentenceInput,
  ) => Promise<CollectOutcome>;
}) {
  return (
    <>
      <div className="kicker">
        <TextQuote size={16} />
        句子解析
      </div>
      <label>原句</label>
      <blockquote className="selectionQuote">{result.source}</blockquote>
      <AnalysisSections result={result} />
      <div className="collectActionRow">
        <CollectAction
          key={`${result.target.articleId}:${result.source}`}
          label="收藏长难句"
          onCollect={() =>
            onCollectLongSentence({
              sourceText: result.source,
              translation: null,
              analysis: result,
              articleId: result.target.articleId,
              paragraphStart: result.target.start.paragraph,
              paragraphEnd: result.target.end.paragraph,
            })
          }
        />
      </div>
    </>
  );
}

export function Inspector({
  assistant,
  article,
  onCollectWord,
  onCollectLongSentence,
  onCollapse,
}: InspectorProps) {
  const { result, pending, error } = assistant;
  return (
    <aside className="inspector" aria-label="精读侧栏">
      <div className="sectitle">
        <span aria-hidden="true" />
        <IconButton label="收起精读侧栏" icon={PanelRightClose} onClick={onCollapse} />
      </div>
      <div className="content" aria-label="翻译与解析结果" aria-live="polite">
        {pending && (
          <div className="assistantPending" role="status">
            正在生成{pending.label}…
          </div>
        )}
        {error && (
          <div className="assistantError" role="alert">
            <span>{error.message}</span>
            <button type="button" onClick={error.retry}>
              重试
            </button>
          </div>
        )}
        {result?.kind === "word" && (
          <WordCardView card={result} onCollectWord={onCollectWord} />
        )}
        {result?.kind === "translation" && (
          <TranslationView
            result={result}
            article={article}
            onRetryParagraph={assistant.retryParagraph}
            onCollectWord={onCollectWord}
            onCollectLongSentence={onCollectLongSentence}
          />
        )}
        {result?.kind === "analysis" && (
          <AnalysisView
            result={result}
            onCollectLongSentence={onCollectLongSentence}
          />
        )}
      </div>
    </aside>
  );
}