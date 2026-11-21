import { SquarePen } from "lucide-react";
import type { ArticleDetail } from "../data/types";
import type { ArticleDraft } from "../components/ArticleDraftFields";
import { ArticleDraftFields } from "../components/ArticleDraftFields";

export interface EditorState {
  articleId: number;
  baseVersion: number;
  draft: ArticleDraft;
  base: ArticleDraft;
}

export function isDraftDirty(editor: EditorState | null): boolean {
  if (!editor) return false;
  return (
    editor.draft.title !== editor.base.title ||
    editor.draft.topic !== editor.base.topic ||
    editor.draft.text !== editor.base.text
  );
}

interface ArticleEditorProps {
  article: ArticleDetail;
  editor: EditorState;
  dirty: boolean;
  saving: boolean;
  error: string;
  onChange: (draft: ArticleDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function ArticleEditor({
  article,
  editor,
  dirty,
  saving,
  error,
  onChange,
  onSave,
  onCancel,
}: ArticleEditorProps) {
  return (
    <div className="editorPane">
      <div className="editorInner">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <div className="editorHead">
            <SquarePen size={15} />
            编辑正文
            <span>
              {dirty ? <><span className="dirtyDot" />未保存</> : "未改动"}
            </span>
          </div>
          <h1>{article.title}</h1>
          <ArticleDraftFields value={editor.draft} onChange={onChange} disabled={saving} />
          {error && <div className="editorError" role="alert">{error}</div>}
          <div className="editorBar">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </button>
            <button type="button" onClick={onCancel} disabled={saving}>
              取消
            </button>
            <span className="editorNote" style={{ marginLeft: "auto" }}>
              保存后正文版本加 1；切换文章前会先保存。
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}