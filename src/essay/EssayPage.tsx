import { useState } from "react";
import { FileUp, PenLine, RefreshCw, Sparkles } from "lucide-react";
import { appFiles, type AppFileService } from "../data/files";
import { errorMessage } from "../utils/error";
import type { EssayIssue, EssayIssueCategory, EssayService, EssaySession, EssaySeverity } from "./types";

const SEVERITIES: Array<{ id: EssaySeverity; label: string; description: string }> = [
  { id: "high", label: "严重问题", description: "影响理解或存在明显语法错误" },
  { id: "medium", label: "建议修改", description: "用词、时态和搭配问题" },
  { id: "low", label: "细节优化", description: "拼写与可进一步改善之处" },
];

const CATEGORY_LABELS: Record<EssayIssueCategory, string> = {
  grammar: "语法",
  word: "单词",
  spelling: "拼写",
  tense: "时态",
  collocation: "搭配",
  other: "其他",
};

export function EssayPage({
  service,
  session,
  onSessionChange,
  files = appFiles,
}: {
  service: EssayService;
  session: EssaySession;
  onSessionChange: (
    update: EssaySession | ((current: EssaySession) => EssaySession),
  ) => void;
  files?: AppFileService;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const busy = submitting || session.pendingId != null;

  async function review() {
    const text = session.text.trim();
    if (!text) {
      setError("请先粘贴或导入一篇英语作文");
      return;
    }
    const requestId = Date.now() + Math.random();
    setSubmitting(true);
    setError("");
    onSessionChange((current) => ({ ...current, pendingId: requestId }));
    try {
      const result = await service.review(text);
      onSessionChange((current) =>
        current.pendingId === requestId && current.text.trim() === text
          ? { text, result, pendingId: null }
          : current,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
      onSessionChange((current) => current.pendingId === requestId
        ? { ...current, pendingId: null }
        : current);
    }
  }

  async function importEssay() {
    setError("");
    try {
      const picked = await files.pickText(["txt"]);
      if (picked) onSessionChange({ text: picked.content, result: null, pendingId: null });
    } catch (cause) {
      setError(`导入作文失败：${errorMessage(cause)}`);
    }
  }

  const result = session.result;
  return (
    <div className="libraryMain essayMain">
      <div className="libTop">
        <h1>作文批改</h1>
        <span className="pageNote">仅在当前会话保留 · 不写入数据库</span>
      </div>
      <div className="libScroll">
        <div className="libInner essayInner">
          <section className="essayComposer" aria-labelledby="essay-input-title">
            <div className="essaySectionHead">
              <div><PenLine size={18} /><h2 id="essay-input-title">英语作文</h2></div>
              <button type="button" disabled={busy} onClick={() => void importEssay()}>
                <FileUp size={15} /> 导入 TXT
              </button>
            </div>
            <textarea
              aria-label="作文正文"
              lang="en"
              value={session.text}
              disabled={busy}
              placeholder="粘贴英语作文，或从本地导入 TXT 文件…"
              onChange={(event) => onSessionChange({ text: event.target.value, result: null, pendingId: null })}
            />
            <div className="essayComposerFoot">
              <span>{session.text.trim().length} 字符</span>
              <button type="button" className="primary" disabled={busy || !session.text.trim()} onClick={() => void review()}>
                <Sparkles size={15} /> {busy ? "AI 批改中…" : result ? "重新批改" : "提交 AI 批改"}
              </button>
            </div>
            {error && <p className="essayError" role="alert">{error}</p>}
          </section>

          {busy && <div className="essayLoading" role="status">正在检查语法、单词、拼写、时态与搭配…</div>}
          {result && !busy && (
            <div className="essayResults" aria-live="polite">
              <div className="essayResultTitle">
                <div><Sparkles size={18} /><h2>批改结果</h2><span>{result.issues.length} 处建议</span></div>
                <button type="button" onClick={() => void review()}><RefreshCw size={14} /> 重新批改</button>
              </div>
              {result.issues.length === 0 && <p className="essayNoIssues">没有发现明确错误，仍可参考下方润色版。</p>}
              {SEVERITIES.map((severity) => {
                const issues = result.issues.filter((issue) => issue.severity === severity.id);
                if (!issues.length) return null;
                return (
                  <section className={`essayIssueSection ${severity.id}`} key={severity.id} aria-labelledby={`essay-${severity.id}`}>
                    <div className="essayIssueHeading"><h3 id={`essay-${severity.id}`}>{severity.label}</h3><span>{severity.description}</span><em>{issues.length}</em></div>
                    {issues.map((issue: EssayIssue, index) => (
                      <article className="essayIssue" key={`${issue.location}-${index}`}>
                        <div className="essayIssueMeta"><span>{CATEGORY_LABELS[issue.category]}</span><strong>{issue.location}</strong></div>
                        {issue.original && <div className="essayCorrection"><span>原文</span><del>{issue.original}</del></div>}
                        {issue.suggestion && <div className="essayCorrection suggestion"><span>建议</span><ins>{issue.suggestion}</ins></div>}
                        {issue.explanation && <p>{issue.explanation}</p>}
                      </article>
                    ))}
                  </section>
                );
              })}
              {result.polished && (
                <section className="essayPolished" aria-labelledby="essay-polished">
                  <h3 id="essay-polished">润色版</h3>
                  <p lang="en">{result.polished}</p>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
