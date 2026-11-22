import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  BookOpen,
  FileText,
  Languages,
  PanelLeftOpen,
  PanelRightOpen,
  SquarePen,
} from "lucide-react";
import type { ArticleDetail, ReaderApi, WordlistSummary } from "../data/types";
import { IconButton } from "../components/IconButton";
import {
  createVocabularyList,
  tokenizeWithVocabulary,
  type VocabularyList,
} from "../language/vocabulary";
import { VocabularySelector } from "./VocabularySelector";
import { readWordlistSelection, writeWordlistSelection } from "./wordlistSelection";
import { errorMessage } from "../utils/error";
import {
  ArticleEditor,
  isDraftDirty,
  type EditorState,
} from "./ArticleEditor";
import type { ArticleDraft } from "../components/ArticleDraftFields";
import { SelectionToolbar } from "./SelectionToolbar";
import { captureSelection, wordSelectionFromMark, type CapturedSelection } from "./selection";

interface ReaderViewProps {
  api: ReaderApi;
  notify: (text: string, kind?: "info" | "error") => void;
  article: ArticleDetail | null;
  paragraphTarget: {
    articleId: number;
    paragraphStart: number;
    paragraphEnd: number;
  } | null;
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
  onAskWord: (selection: CapturedSelection) => void;
  onTranslateSelection: (selection: CapturedSelection) => void;
  onAnalyzeSelection: (selection: CapturedSelection) => void;
  onTranslateParagraph: (index: number) => void;
  onTranslateArticle: () => void;
}

function pad(index: number) {
  return String(index + 1).padStart(2, "0");
}

const VOCABULARY_LEGEND = [
  { id: "cet4", label: "四级高频", className: "cet4" },
  { id: "cet6", label: "六级高频", className: "cet6" },
  { id: "ky", label: "考研高频", className: "ky" },
] as const;

export function ReaderView({
  api,
  notify,
  article,
  paragraphTarget,
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
  onAskWord,
  onTranslateSelection,
  onAnalyzeSelection,
  onTranslateParagraph,
  onTranslateArticle,
}: ReaderViewProps) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [availableLists, setAvailableLists] = useState<WordlistSummary[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<string[] | null>(null);
  const [vocabularyLists, setVocabularyLists] = useState<VocabularyList[]>([]);
  const [toolbar, setToolbar] = useState<CapturedSelection | null>(null);
  const dirty = isDraftDirty(editor);

  useEffect(() => {
    let cancelled = false;
    api.listWordlists().then((lists) => {
      if (cancelled) return;
      const enabled = lists.filter((list) => list.enabled);
      setAvailableLists(enabled);
      setSelectedListIds(readWordlistSelection(enabled.map((list) => list.id)));
    }).catch((cause) => {
      if (!cancelled) notify(`加载词表失败：${errorMessage(cause)}`, "error");
    });
    return () => {
      cancelled = true;
    };
  }, [api, notify]);

  useEffect(() => {
    if (selectedListIds === null) return;
    writeWordlistSelection(selectedListIds);
    let cancelled = false;
    setVocabularyLists([]);
    api.listWords(selectedListIds).then((lists) => {
      if (cancelled) return;
      setVocabularyLists(lists.map((list) => createVocabularyList(list.id, list.name, list.words)));
    }).catch((cause) => {
      if (!cancelled) notify(`读取标色单词失败：${errorMessage(cause)}`, "error");
    });
    return () => {
      cancelled = true;
    };
  }, [api, notify, selectedListIds]);

  useEffect(() => {
    if (editor || !paperRef.current) return;
    const paragraphStart =
      paragraphTarget && paragraphTarget.articleId === article?.id
        ? paragraphTarget.paragraphStart
        : null;
    const target =
      paragraphStart === null
        ? null
        : paperRef.current.querySelector<HTMLElement>(
            `p[data-i="${paragraphStart}"]`,
          );
    if (target) target.scrollIntoView({ block: "start" });
    else paperRef.current.scrollTop = 0;
  }, [article?.id, editor, paragraphTarget]);

  // 切换文章或进入编辑时关闭旧选区工具条，避免操作落到上一篇。
  useEffect(() => {
    setToolbar(null);
  }, [article?.id, editor]);

  useEffect(() => {
    if (!toolbar) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".selectionToolbar")) {
        return;
      }
      setToolbar(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setToolbar(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [toolbar]);

  const captureCurrentSelection = () => {
    if (!paperRef.current) return;
    setToolbar(captureSelection(paperRef.current, window.getSelection()));
  };

  const askWordFromMark = (event: MouseEvent<HTMLParagraphElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const mark = target.closest<HTMLElement>("mark.vocabMark");
    if (!mark) return;
    if (window.getSelection()?.toString().trim()) return;
    const captured = wordSelectionFromMark(event.currentTarget, mark);
    if (!captured) return;
    setToolbar(null);
    onAskWord(captured);
  };

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
          {article && !editor && (
            <>
              <VocabularySelector
                lists={availableLists}
                selectedIds={selectedListIds ?? []}
                onChange={setSelectedListIds}
              />
              <button type="button" onClick={onTranslateArticle} title="全文翻译">
                <Languages size={15} /> 全文翻译
              </button>
            </>
          )}
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
        <div className="paper" ref={paperRef} onScroll={() => setToolbar(null)}>
          <div className="sheet">
            <div className="eyebrow">
              <span />
              {(article.suiteTitle ?? "PASTED READING").toUpperCase()}
            </div>
            <h1>{article.title}</h1>
            <hr />
            {vocabularyLists.some((list) => VOCABULARY_LEGEND.some((item) => item.id === list.id)) && (
              <div className="vocabLegend" aria-label="词表高亮图例">
                {VOCABULARY_LEGEND.filter((item) => vocabularyLists.some((list) => list.id === item.id)).map((item) => (
                  <span key={item.id}><i className={item.className} />{item.label}</span>
                ))}
                <small>重叠命中以多色下划线区分</small>
              </div>
            )}
            {article.paragraphs.map((paragraph, index) => (
              <section key={`${article.id}-${index}`}>
                <div className="parhead">
                  <small>¶ {pad(index)}</small>
                  <button
                    type="button"
                    title={`翻译第 ${index + 1} 段`}
                    onClick={() => onTranslateParagraph(index)}
                  >
                    <Languages size={13} /> 本段翻译
                  </button>
                </div>
                <p
                  lang="en"
                  data-i={index}
                  onMouseUp={captureCurrentSelection}
                  onKeyUp={(event) => {
                    if (event.shiftKey) captureCurrentSelection();
                  }}
                  onClick={askWordFromMark}
                >
                  {vocabularyLists.length > 0
                    ? tokenizeWithVocabulary(paragraph, vocabularyLists).map((token, tokenIndex) =>
                        token.matches.length > 0 ? (
                          <mark
                            key={tokenIndex}
                            className={`vocabMark ${token.matches
                              .map((match) => match.id)
                              .join(" ")}`}
                            title={token.matches
                              .map((match) => match.label)
                              .join(" · ")}
                          >
                            {token.text}
                          </mark>
                        ) : (
                          token.text
                        ),
                      )
                    : paragraph}
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

      {toolbar && !editor && (
        <SelectionToolbar
          selection={toolbar}
          onAskWord={(selection) => {
            setToolbar(null);
            onAskWord(selection);
          }}
          onTranslate={(selection) => {
            setToolbar(null);
            onTranslateSelection(selection);
          }}
          onAnalyze={(selection) => {
            setToolbar(null);
            onAnalyzeSelection(selection);
          }}
        />
      )}
    </main>
  );
}