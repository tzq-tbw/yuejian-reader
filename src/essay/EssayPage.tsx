import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileUp,
  History,
  PanelLeftClose,
  PenLine,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { appFiles, type AppFileService } from "../data/files";
import { getApi } from "../data";
import type { ReaderApi } from "../data/types";
import { errorMessage } from "../utils/error";
import type {
  EssayDocument,
  EssayIssue,
  EssayIssueCategory,
  EssayRevision,
  EssayService,
  EssaySession,
  EssaySeverity,
} from "./types";

const SEVERITIES: Array<{ id: EssaySeverity; label: string; description: string }> = [
  { id: "high", label: "严重问题", description: "影响理解或存在明显语法错误" },
  { id: "medium", label: "建议修改", description: "用词、时态和搭配问题" },
  { id: "low", label: "细节优化", description: "拼写与可进一步改善之处" },
];

const ESSAY_DOCUMENT_SELECTION_KEY = "yuejian.essay.selectedDocumentId";

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
  api = getApi(),
}: {
  service: EssayService;
  session: EssaySession;
  onSessionChange: (
    update: EssaySession | ((current: EssaySession) => EssaySession),
  ) => void;
  files?: AppFileService;
  api?: ReaderApi;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [documents, setDocuments] = useState<EssayDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const busy = submitting || session.pendingId != null;
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? null;

  function openDocument(document: EssayDocument, revision?: EssayRevision) {
    const latest = revision ?? document.revisions.at(-1);
    setSelectedDocumentId(document.id);
    setSelectedRevisionId(latest?.id ?? null);
    setRenaming(false);
    setError("");
    onSessionChange({
      text: revision ? revision.text : document.text,
      result: revision
        ? revision.result
        : latest && latest.text === document.text
          ? latest.result
          : null,
      pendingId: null,
    });
  }

  useEffect(() => {
    try {
      if (selectedDocumentId === null) window.localStorage.removeItem(ESSAY_DOCUMENT_SELECTION_KEY);
      else window.localStorage.setItem(ESSAY_DOCUMENT_SELECTION_KEY, String(selectedDocumentId));
    } catch {
      // 序号恢复失败不影响当前作文编辑。
    }
  }, [selectedDocumentId]);

  useEffect(() => {
    let cancelled = false;
    api.listEssayDocuments().then((items) => {
      if (cancelled) return;
      setDocuments(items);
      const storedId = Number(window.localStorage.getItem(ESSAY_DOCUMENT_SELECTION_KEY));
      const selected = items.find((item) => item.id === storedId) ?? items[0];
      if (selected) {
        if (sessionRef.current.text.trim()) setSelectedDocumentId(selected.id);
        else openDocument(selected);
      }
    }).catch((cause) => {
      if (!cancelled) setError(`加载作文历史失败：${errorMessage(cause)}`);
    }).finally(() => {
      if (!cancelled) setHistoryLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function refreshDocuments(selectedId?: number) {
    const items = await api.listEssayDocuments();
    setDocuments(items);
    if (selectedId !== undefined) setSelectedDocumentId(selectedId);
    return items;
  }

  async function review() {
    const text = session.text.trim();
    if (!text) {
      setError("请先粘贴或导入一篇英语作文");
      return;
    }
    const requestId = Date.now() + Math.random();
    const documentId = selectedDocumentId;
    setSubmitting(true);
    setError("");
    onSessionChange((current) => ({ ...current, pendingId: requestId }));
    try {
      const result = await service.review(text);
      if (sessionRef.current.pendingId !== requestId || sessionRef.current.text.trim() !== text) return;
      const id = documentId ?? (await api.createEssayDocument({ text })).id;
      const revision = await api.addEssayRevision({ documentId: id, text, result });
      if (sessionRef.current.pendingId !== requestId || sessionRef.current.text.trim() !== text) return;
      await refreshDocuments(id);
      setSelectedRevisionId(revision.id);
      onSessionChange((current) =>
        current.pendingId === requestId && current.text.trim() === text
          ? { text, result, pendingId: null }
          : current,
      );
    } catch (cause) {
      if (sessionRef.current.pendingId === requestId) setError(errorMessage(cause));
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

  async function createDocument() {
    const text = session.text.trim();
    if (!text) {
      setError("请先粘贴或导入作文，再新建修改区");
      return;
    }
    try {
      const document = await api.createEssayDocument({ text });
      await refreshDocuments(document.id);
      setHistoryOpen(true);
      setSelectedRevisionId(null);
      onSessionChange({ text, result: null, pendingId: null });
    } catch (cause) {
      setError(`新建修改区失败：${errorMessage(cause)}`);
    }
  }

  async function saveText() {
    if (!selectedDocument || busy || !session.text.trim() || session.text.trim() === selectedDocument.text) return;
    try {
      await api.updateEssayText(selectedDocument.id, session.text);
      await refreshDocuments(selectedDocument.id);
    } catch (cause) {
      setError(`保存作文正文失败：${errorMessage(cause)}`);
    }
  }

  async function renameDocument() {
    if (!selectedDocument) return;
    try {
      await api.renameEssayDocument(selectedDocument.id, renameDraft);
      await refreshDocuments(selectedDocument.id);
      setRenaming(false);
    } catch (cause) {
      setError(`重命名失败：${errorMessage(cause)}`);
    }
  }

  async function deleteDocument(document: EssayDocument) {
    if (!window.confirm(`删除修改区 ${document.sequenceNo} 及其全部批改记录？`)) return;
    try {
      await api.deleteEssayDocument(document.id);
      const items = await refreshDocuments();
      if (selectedDocumentId === document.id) {
        const next = items.find((item) => item.sequenceNo > document.sequenceNo) ?? items.at(-1);
        if (next) openDocument(next);
        else {
          setSelectedDocumentId(null);
          setSelectedRevisionId(null);
          onSessionChange({ text: "", result: null, pendingId: null });
        }
      }
    } catch (cause) {
      setError(`删除作文失败：${errorMessage(cause)}`);
    }
  }

  async function deleteRevision(revision: EssayRevision) {
    try {
      await api.deleteEssayRevision(revision.id);
      const items = await refreshDocuments();
      const document = items.find((item) => item.id === revision.documentId);
      if (document && selectedDocumentId === document.id) openDocument(document);
    } catch (cause) {
      setError(`删除批改记录失败：${errorMessage(cause)}`);
    }
  }

  const result = session.result;
  return (
    <div className="libraryMain essayMain">
      <div className="libTop">
        <h1>作文批改</h1>
        <span className="pageNote">作文与历次批改自动保存到本机</span>
        <button
          type="button"
          className="ghostButton essayHistoryToggle"
          aria-expanded={historyOpen}
          onClick={() => setHistoryOpen((open) => !open)}
        >
          <History size={15} /> 作文历史
        </button>
      </div>
      <div className="essayBody">
        {historyOpen && (
          <aside className="essayHistory" aria-label="作文历史">
            <div className="essayHistoryHead">
              <strong>修改区</strong>
              <button type="button" className="icon" aria-label="收起作文历史" onClick={() => setHistoryOpen(false)}>
                <PanelLeftClose size={16} />
              </button>
            </div>
            <button type="button" className="essayNewDocument" disabled={busy} onClick={() => void createDocument()}>
              <Plus size={14} /> 新建作文
            </button>
            {historyLoading ? <p className="essayHistoryEmpty">读取中…</p> : documents.length === 0 ? (
              <p className="essayHistoryEmpty">首次批改后生成序号 1</p>
            ) : (
              <div className="essayHistoryList">
                {documents.map((document) => {
                  const expanded = expandedIds.has(document.id);
                  return (
                    <div className="essayHistoryDocument" key={document.id}>
                      <div className={`essayHistoryRow${document.id === selectedDocumentId ? " selected" : ""}`}>
                        <button
                          type="button"
                          className="essaySequence"
                          aria-label={`选择作文 ${document.sequenceNo}`}
                          title={document.name}
                          disabled={busy}
                          onClick={() => openDocument(document)}
                        >
                          {document.sequenceNo}
                        </button>
                        <button
                          type="button"
                          className="icon"
                          aria-label={`${expanded ? "收起" : "展开"}作文 ${document.sequenceNo} 的批改记录`}
                          aria-expanded={expanded}
                          onClick={() => setExpandedIds((current) => {
                            const next = new Set(current);
                            if (next.has(document.id)) next.delete(document.id);
                            else next.add(document.id);
                            return next;
                          })}
                        >
                          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <button type="button" className="icon danger" aria-label={`删除作文 ${document.sequenceNo}`} disabled={busy} onClick={() => void deleteDocument(document)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {expanded && (
                        <div className="essayRevisionList">
                          {document.revisions.length === 0 && <small>还没有批改记录</small>}
                          {document.revisions.map((revision) => (
                            <div className="essayRevisionRow" key={revision.id}>
                              <button
                                type="button"
                                className={revision.id === selectedRevisionId ? "selected" : ""}
                                disabled={busy}
                                onClick={() => openDocument(document, revision)}
                              >
                                第 {revision.revisionNo} 次批改
                              </button>
                              <button type="button" className="icon" aria-label={`删除作文 ${document.sequenceNo} 的第 ${revision.revisionNo} 次批改`} onClick={() => void deleteRevision(revision)}>
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        )}
        <div className="libScroll">
          <div className="libInner essayInner">
            <section className="essayComposer" aria-labelledby="essay-input-title">
              <div className="essaySectionHead">
                <div><PenLine size={18} /><h2 id="essay-input-title">英语作文</h2></div>
                <button type="button" disabled={busy} onClick={() => void importEssay()}>
                  <FileUp size={15} /> 导入 TXT
                </button>
              </div>
              <div className="essayDocumentBar">
                {selectedDocument ? (
                  renaming ? (
                    <div className="essayRename">
                      <input aria-label="修改区名称" value={renameDraft} maxLength={60} onChange={(event) => setRenameDraft(event.target.value)} />
                      <button type="button" className="icon" aria-label="保存修改区名称" onClick={() => void renameDocument()}><Check size={15} /></button>
                      <button type="button" className="icon" aria-label="取消重命名" onClick={() => setRenaming(false)}><X size={15} /></button>
                    </div>
                  ) : (
                    <>
                      <span>修改区 {selectedDocument.sequenceNo}</span>
                      <strong>{selectedDocument.name}</strong>
                      <button type="button" className="icon" aria-label="重命名修改区" onClick={() => {
                        setRenameDraft(selectedDocument.name);
                        setRenaming(true);
                      }}><Pencil size={14} /></button>
                    </>
                  )
                ) : <span>新作文 · 首次批改后生成序号</span>}
              </div>
              <textarea
                aria-label="作文正文"
                lang="en"
                value={session.text}
                disabled={busy}
                placeholder="粘贴英语作文，或从本地导入 TXT 文件…"
                onBlur={() => void saveText()}
                onChange={(event) => {
                  setSelectedRevisionId(null);
                  onSessionChange({ text: event.target.value, result: null, pendingId: null });
                }}
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
    </div>
  );
}
