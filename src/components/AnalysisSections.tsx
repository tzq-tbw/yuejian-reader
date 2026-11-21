import type { AnalysisContent } from "../collection/analysis";

export function AnalysisSections({
  result,
}: {
  result: AnalysisContent;
}) {
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