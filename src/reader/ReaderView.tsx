import { useEffect, useRef } from "react";
import {
  BookOpen,
  FileText,
  Languages,
  PanelLeftOpen,
  PanelRightOpen,
  SquarePen,
} from "lucide-react";
import type { ArticleDetail } from "../data/types";
import { IconButton } from "../components/IconButton";
import {
  ArticleEditor,
  isDraftDirty,
  type EditorState,
} from "./ArticleEditor";
import type { ArticleDraft } from "../components/ArticleDraftFields";

interface ReaderViewProps {
  article: ArticleDetail | null;
  sectionName: string | null;
  currentSectionId: string | null;
  editor: EditorState | null;
  saving: boolean;
  editorError: string;
  listOpen: boolean;
  sideOpen: boolean;
  onExpandList: () => void;
  onExpandSide: () => void;
  onStartEdit: () => void;
  onSaveEditor: () => void;
  onCancelEdit: () => void;
  onChangeDraft: (draft: ArticleDraft) => void;
  onOpenPicker: (sectionId: string, opener: HTMLElement | null) => void;
  onOpenPaste: (opener: HTMLElement | null) => void;
  onGoLibrary: () => void;
}

function pad(index: number) {
  return String(index + 1).padStart(2, "0");
}

export function ReaderView({
  article,
  sectionName,
  currentSectionId,
  editor,
  saving,
  editorError,
  listOpen,
  sideOpen,
  onExpandList,
  onExpandSide,
  onStartEdit,
  onSaveEditor,
  onCancelEdit,
  onChangeDraft,
  onOpenPicker,
  onOpenPaste,
  onGoLibrary,
}: ReaderViewProps) {
  const paperRef = useRef<HTMLDivElement>(null);
  const dirty = isDraftDirty(editor);

  useEffect(() => {
    if (!editor && paperRef.current) paperRef.current.scrollTop = 0;
  }, [article?.id, editor]);

  return (
    <main>
      <div className="toolbar">
        <div>
          {!listOpen && (
            <IconButton
              label="展开文章列表"
              icon={PanelLeftOpen}
              onClick={onExpandList}
            />
          )}
          <span className="toolbarTitle">{sectionName ?? "阅读工作台"}</span>
          {article && <span className="crumbline">· {article.title}</span>}
        </div>
        <div className="toolbarSpacer" />
        <div>
          {editor ? (
            <span className="crumbline">
              {dirty ? <><span className="dirtyDot" />编辑中 · 未保存</> : "编辑中"}
            </span>
          ) : (
            article && (
              <button type="button" onClick={onStartEdit}>
                <SquarePen size={15} /> 编辑
              </button>
            )
          )}
          {!sideOpen && (
            <IconButton
              label="展开精读侧栏"
              icon={PanelRightOpen}
              onClick={onExpandSide}
            />
          )}
        </div>
      </div>

      {editor && article ? (
        <ArticleEditor
          article={article}
          editor={editor}
          dirty={dirty}
          saving={saving}
          error={editorError}
          onChange={onChangeDraft}
          onSave={onSaveEditor}
          onCancel={onCancelEdit}
        />
      ) : article ? (
        <div className="paper" ref={paperRef}>
          <div className="sheet">
            <div className="eyebrow">
              <span />
              {(article.suiteTitle ?? "PASTED READING").toUpperCase()}
            </div>
            <h1>{article.title}</h1>
            <hr />
            {article.paragraphs.map((paragraph, index) => (
              <section key={`${article.id}-${index}`}>
                <div className="parhead">
                  <small>¶ {pad(index)}</small>
                </div>
                <p lang="en" data-i={index}>
                  {paragraph}
                </p>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className="emptyReader">
          <div className="inner">
            <BookOpen size={42} />
            <h2>{currentSectionId ? "这个分区还是空的" : "还没有打开文章"}</h2>
            <p>
              {currentSectionId
                ? "从资料库选择一篇文章加入当前分区，或者直接粘贴一篇新材料。"
                : "先从左侧阅读列表选择文章；也可以在资料库里选择或粘贴文章。"}
            </p>
            <div className="actions">
              {currentSectionId && (
                <button
                  type="button"
                  className="primary"
                  onClick={(event) =>
                    onOpenPicker(currentSectionId, event.currentTarget)
                  }
                >
                  <FileText size={15} /> 从资料库添加
                </button>
              )}
              <button type="button" onClick={(event) => onOpenPaste(event.currentTarget)}>
                <Languages size={15} /> 粘贴新文章
              </button>
              <button type="button" onClick={onGoLibrary}>
                打开资料库
              </button>
            </div>
          </div>
        </div>
      )}

      <footer>
        <BookOpen size={13} />
        {sectionName ?? article?.suiteTitle ?? "阅读工作台"}
        {article && <span>{article.paragraphCount} 段</span>}
      </footer>
    </main>
  );
}