import { useEffect, useState } from "react";
import { Modal } from "../components/Modal";
import { errorMessage } from "../utils/error";

interface SectionNameDialogProps {
  open: boolean;
  mode: "create" | "rename";
  initialName?: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  returnFocus?: HTMLElement | null;
}

export function SectionNameDialog({
  open,
  mode,
  initialName = "",
  onClose,
  onSave,
  returnFocus,
}: SectionNameDialogProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError("");
      setBusy(false);
    }
  }, [open, initialName]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("分区名称不能为空");
      return;
    }
    setBusy(true);
    try {
      await onSave(trimmed);
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
      title={mode === "create" ? "新建分区" : "重命名分区"}
      onClose={onClose}
      returnFocus={returnFocus}
    >
      <form onSubmit={submit}>
        <label htmlFor="section-name">分区名称</label>
        <input
          id="section-name"
          type="text"
          value={name}
          data-autofocus
          maxLength={60}
          disabled={busy}
          placeholder="例如：本周精读"
          onChange={(event) => setName(event.target.value)}
        />
        <div className="fieldHint">去掉首尾空白后不能为空；分区 ID 与成员保持不变。</div>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="actions">
          <button type="button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "保存中…" : mode === "create" ? "创建" : "保存名称"}
          </button>
        </div>
      </form>
    </Modal>
  );
}