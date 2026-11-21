import { useEffect, useState } from "react";
import type { ArticleDetail, ReaderApi } from "../data/types";
import { parsePastedText } from "../data/text";
import { errorMessage } from "../utils/error";
import { Modal } from "../components/Modal";
import { ArticleDraftFields, type ArticleDraft } from "../components/ArticleDraftFields";

interface PasteDialogProps {
  api: ReaderApi;
  open: boolean;
  defaultSectionName: string;
  onClose: () => void;
  onCreated: (article: ArticleDetail) => Promise<void> | void;
  returnFocus?: HTMLElement | null;
}

const EMPTY: ArticleDraft = { title: "", topic: "", text: "" };

export function PasteDialog({
  api,
  open,
  defaultSectionName,
  onClose,
  onCreated,
  returnFocus,
}: PasteDialogProps) {
  const [draft, setDraft] = useState<ArticleDraft>(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(EMPTY);
      setError("");
      setBusy(false);
    }
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!draft.title.trim()) {
      setError("标题不能为空");
      return;
    }
    if (!parsePastedText(draft.text).length) {
      setError("正文不能为空，至少粘贴一段英文");
      return;
    }
    setBusy(true);
    try {
      const article = await api.pasteArticle({
        title: draft.title,
        topic: draft.topic,
        text: draft.text,
      });
      await onCreated(article);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="粘贴新文章"
      onClose={onClose}
      returnFocus={returnFocus}
      footer={null}
    >
      <form onSubmit={submit}>
        <p className="sub">
          一次粘贴生成一篇，段落会被保留。保存后自动加入默认分区「
          {defaultSectionName}」，也可以在资料库中再加入其他分区。
        </p>
        <ArticleDraftFields value={draft} onChange={setDraft} disabled={busy} />
        {error && <div className="error" role="alert">{error}</div>}
        <div className="actions">
          <button type="button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "保存中…" : "保存文章"}
          </button>
        </div>
      </form>
    </Modal>
  );
}