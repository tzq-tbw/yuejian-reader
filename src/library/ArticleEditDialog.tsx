import { useEffect, useState } from "react";
import type { ArticleDetail, ReaderApi } from "../data/types";
import { Modal } from "../components/Modal";
import { ArticleDraftFields, type ArticleDraft } from "../components/ArticleDraftFields";
import { parsePastedText, paragraphsToText } from "../data/text";
import { errorMessage } from "../utils/error";

interface ArticleEditDialogProps {
  api: ReaderApi;
  articleId: number | null;
  onClose: () => void;
  onSaved: (article: ArticleDetail) => Promise<void> | void;
  notify: (text: string, kind?: "info" | "error") => void;
  returnFocus?: HTMLElement | null;
}

export function ArticleEditDialog({
  api,
  articleId,
  onClose,
  onSaved,
  notify,
  returnFocus,
}: ArticleEditDialogProps) {
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [draft, setDraft] = useState<ArticleDraft>({ title: "", topic: "", text: "" });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (articleId == null) return;
    setArticle(null);
    setError("");
    setLoading(true);
    let cancelled = false;
    api
      .getArticle(articleId)
      .then((detail) => {
        if (cancelled) return;
        setArticle(detail);
        setDraft({
          title: detail.title,
          topic: detail.topic,
          text: paragraphsToText(detail.paragraphs),
        });
        window.setTimeout(() => {
          document
            .querySelector<HTMLInputElement>(".dialog .draftFields input[type='text']")
            ?.focus();
        }, 0);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId, api]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!article) return;
    setError("");
    if (!draft.title.trim()) {
      setError("标题不能为空");
      return;
    }
    const paragraphs = parsePastedText(draft.text);
    if (!paragraphs.length) {
      setError("正文不能为空");
      return;
    }
    setBusy(true);
    try {
      const updated = await api.updateArticle({
        id: article.id,
        title: draft.title,
        topic: draft.topic,
        paragraphs,
        expectedVersion: article.version,
      });
      await onSaved(updated);
      notify("已保存文章修改");
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={articleId != null}
      title="编辑资料库文章"
      onClose={onClose}
      wide
      returnFocus={returnFocus}
    >
      {loading && <p className="busy">正在加载文章…</p>}
      {!loading && article && (
        <form onSubmit={submit}>
          <p className="sub">
            修改后正文版本加 1；已加入各分区的阅读入口会读取同一版本。
          </p>
          <ArticleDraftFields value={draft} onChange={setDraft} disabled={busy} />
          {error && <div className="error" role="alert">{error}</div>}
          <div className="actions">
            <button type="button" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "保存中…" : "保存修改"}
            </button>
          </div>
        </form>
      )}
      {!loading && !article && error && (
        <div className="error" role="alert">{error}</div>
      )}
    </Modal>
  );
}