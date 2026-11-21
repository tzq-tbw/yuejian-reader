import {
  BookMarked,
  Languages,
  PanelRightClose,
  TextQuote,
} from "lucide-react";
import type {
  AnalysisResult,
  TranslationResult,
  WordCard,
} from "../language/types";
import type { ReadingAssistant } from "../language/useReadingAssistant";
import { IconButton } from "../components/IconButton";

interface InspectorProps {
  assistant: ReadingAssistant;
  onCollapse: () => void;
}

function WordCardView({ card }: { card: WordCard }) {
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
    </>
  );
}

function TranslationView({
  result,
  onRetryParagraph,
}: {
  result: TranslationResult;
  onRetryParagraph: (index: number) => void;
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
              <p className="translationText">{row.translation}</p>
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
    </>
  );
}

function AnalysisSections({ result }: { result: AnalysisResult }) {
  const hasContent =
    result.trunk ||
    result.clauses.length > 0 ||
    result.modifiers.length > 0 ||
    result.collocations.length > 0;

  if (!hasContent) {
    return <p className="assistantMuted">模型没有识别到可展示的句法成分。</p>;
  }
  return (
    <>
      {result.trunk && (
        <>
          <label>语法主干</label>
          <p>{result.trunk}</p>
        </>
      )}
      {result.clauses.length > 0 && (
        <>
          <label>从句</label>
          <ul className="analysisList">
            {result.clauses.map((clause, index) => (
              <li key={index}>
                {clause.text && <b>{clause.text}</b>}
                {clause.explanation && <span>{clause.explanation}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {result.modifiers.length > 0 && (
        <>
          <label>修饰关系</label>
          <ul className="analysisList">
            {result.modifiers.map((modifier, index) => (
              <li key={index}>
                <span>{modifier}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {result.collocations.length > 0 && (
        <>
          <label>短语搭配</label>
          <ul className="analysisList">
            {result.collocations.map((collocation, index) => (
              <li key={index}>
                {collocation.phrase && <b>{collocation.phrase}</b>}
                {collocation.meaning && <span>{collocation.meaning}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function AnalysisView({ result }: { result: AnalysisResult }) {
  return (
    <>
      <div className="kicker">
        <TextQuote size={16} />
        句子解析
      </div>
      <label>原句</label>
      <blockquote className="selectionQuote">{result.source}</blockquote>
      <AnalysisSections result={result} />
    </>
  );
}

export function Inspector({ assistant, onCollapse }: InspectorProps) {
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
        {result?.kind === "word" && <WordCardView card={result} />}
        {result?.kind === "translation" && (
          <TranslationView
            result={result}
            onRetryParagraph={assistant.retryParagraph}
          />
        )}
        {result?.kind === "analysis" && <AnalysisView result={result} />}
      </div>
    </aside>
  );
}