import { useCallback, useEffect, useMemo, useState } from "react";
import { App as KonstaApp } from "konsta/react";
import { BookOpen, Bookmark, CalendarCheck, LibraryBig, PenLine, Settings } from "lucide-react";
import type {
  ArticleDetail,
  ArticleSummary,
  LibraryGroup,
  ReaderApi,
  Section,
} from "./data/types";
import type { LanguageService } from "./language/types";
import { createLanguageService } from "./language/service";
import { useReadingAssistant } from "./language/useReadingAssistant";
import type { CapturedSelection } from "./reader/selection";
import { getApi, isTauriRuntime } from "./data";
import { parsePastedText, paragraphsToText } from "./data/text";
import { errorMessage } from "./utils/error";
import { SectionList } from "./reading-list/SectionList";
import { SectionNameDialog } from "./reading-list/SectionNameDialog";
import { LibraryPicker } from "./library/LibraryPicker";
import { LibraryPage } from "./library/LibraryPage";
import { PasteDialog } from "./library/PasteDialog";
import { ReaderView } from "./reader/ReaderView";
import { Inspector } from "./reader/Inspector";
import { CollectionPage } from "./collection/CollectionPage";
import { ReviewPage } from "./review/ReviewPage";
import { SettingsPage } from "./settings/SettingsPage";
import { EssayPage } from "./essay/EssayPage";
import { createEssayService } from "./essay/service";
import type { EssayService, EssaySession } from "./essay/types";
import type { ReviewCoach } from "./review/coach";
import type {
  CollectLongSentenceInput,
  CollectOutcome,
  CollectWordInput,
} from "./collection/types";
import { shouldConfirmLongSentence } from "./collection/sentence";
import { packAnalysis } from "./collection/analysis";
import { localDateKey } from "./review/schedule";
import {
  isDraftDirty,
  type EditorState,
} from "./reader/ArticleEditor";
import type { ArticleDraft } from "./components/ArticleDraftFields";

const UI_KEY = "yuejian.ui";
const LAST_KEY = "yuejian.last";

type AppView = "reader" | "library" | "collection" | "review" | "essay" | "settings";

const VIEW_LABELS: Record<AppView, string> = {
  reader: "阅读工作台",
  library: "资料库",
  collection: "收藏",
  review: "复习",
  essay: "作文批改",
  settings: "设置",
};

interface WorkspaceData {
  sections: Section[];
  articlesBySection: Record<string, ArticleSummary[]>;
  library: LibraryGroup[];
}

interface LastSelection {
  sectionId: string | null;
  articleId: number | null;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 本地状态只影响下次打开时的默认选择，写入失败不阻断操作。
  }
}

function readUi(): { listOpen?: boolean; sideOpen?: boolean } {
  return readJson(UI_KEY) ?? {};
}

function readLast(): LastSelection | null {
  return readJson(LAST_KEY);
}

async function fetchArticle(api: ReaderApi, articleId: number) {
  const [article, memberships] = await Promise.all([
    api.getArticle(articleId),
    api.getArticleSections(articleId),
  ]);
  return { article, memberships };
}

export function App({
  api = getApi(),
  language,
  coach,
  essayService,
}: {
  api?: ReaderApi;
  language?: LanguageService;
  coach?: ReviewCoach;
  essayService?: EssayService;
}) {
  const [sections, setSections] = useState<Section[]>([]);
  const [articlesBySection, setArticlesBySection] = useState<
    Record<string, ArticleSummary[]>
  >({});
  const [libraryGroups, setLibraryGroups] = useState<LibraryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [view, setView] = useState<AppView>("reader");
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  const [currentArticle, setCurrentArticle] = useState<ArticleDetail | null>(null);
  const [paragraphTarget, setParagraphTarget] = useState<{
    articleId: number;
    paragraphStart: number;
    paragraphEnd: number;
  } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: "info" | "error" } | null>(
    null,
  );
  const [picker, setPicker] = useState<{
    targetSectionId: string;
    initialIds: number[];
    returnFocus: HTMLElement | null;
  } | null>(null);
  const [sectionDialog, setSectionDialog] = useState<{
    mode: "create" | "rename";
    section?: Section;
    returnFocus: HTMLElement | null;
  } | null>(null);
  const [pasteDialog, setPasteDialog] = useState<{
    returnFocus: HTMLElement | null;
  } | null>(null);
  const [builtinLanguage] = useState(() => createLanguageService());
  const [builtinEssayService] = useState(() => createEssayService());
  const [essaySession, setEssaySession] = useState<EssaySession>({ text: "", result: null });
  const languageService = language ?? builtinLanguage;
  const assistant = useReadingAssistant(currentArticle, languageService);
  const openAssistantSide = () => setSideOpen(true);
  const askWord = (selection: CapturedSelection) => {
    openAssistantSide();
    assistant.askWord(selection);
  };

  const ui = useMemo(readUi, []);
  const [listOpen, setListOpen] = useState(
    ui.listOpen ?? (typeof window !== "undefined" ? window.innerWidth > 900 : true),
  );
  const [sideOpen, setSideOpen] = useState(
    ui.sideOpen ?? (typeof window !== "undefined" ? window.innerWidth > 760 : true),
  );

  const notify = useCallback((text: string, kind: "info" | "error" = "info") => {
    setToast({ text, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    writeJson(UI_KEY, { listOpen, sideOpen });
  }, [listOpen, sideOpen]);

  const refreshAll = useCallback(async (): Promise<WorkspaceData> => {
    const nextSections = await api.listSections();
    const entries = await Promise.all(
      nextSections.map(async (section) => {
        const articles = await api.listSectionArticles(section.id);
        return [section.id, articles] as const;
      }),
    );
    const nextArticles = Object.fromEntries(entries);
    const nextLibrary = await api.listLibrary();
    setSections(nextSections);
    setArticlesBySection(nextArticles);
    setLibraryGroups(nextLibrary);
    return {
      sections: nextSections,
      articlesBySection: nextArticles,
      library: nextLibrary,
    };
  }, [api]);

  const loadAndSetArticle = useCallback(
    async (sectionId: string | null, articleId: number) => {
      const { article, memberships: nextMemberships } = await fetchArticle(api, articleId);
      setCurrentArticle(article);
      setCurrentSectionId(sectionId ?? nextMemberships[0]?.id ?? null);
      setParagraphTarget(null);
      setEditor(null);
      setEditorError("");
      writeJson(LAST_KEY, {
        sectionId: sectionId ?? nextMemberships[0]?.id ?? null,
        articleId,
      });
    },
    [api],
  );

  // 首次加载：读取分区、阅读列表和资料库，恢复上次选中的文章。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await refreshAll();
        if (cancelled) return;
        setExpanded(new Set(data.sections.map((section) => section.id)));
        const last = readLast();
        const section =
          data.sections.find((item) => item.id === last?.sectionId) ??
          data.sections[0];
        if (section) {
          setCurrentSectionId(section.id);
          const list = data.articlesBySection[section.id] ?? [];
          const article =
            list.find((item) => item.id === last?.articleId) ?? list[0];
          if (article) {
            const detail = await api.getArticle(article.id);
            if (cancelled) return;
            setCurrentArticle(detail);
            writeJson(LAST_KEY, {
              sectionId: section.id,
              articleId: article.id,
            });
          }
        }
      } catch (cause) {
        if (!cancelled) notify(`加载本机数据失败：${errorMessage(cause)}`, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, refreshAll, notify]);

  const startEdit = useCallback(() => {
    if (!currentArticle || editor) return;
    const base: ArticleDraft = {
      title: currentArticle.title,
      topic: currentArticle.topic,
      text: paragraphsToText(currentArticle.paragraphs),
    };
    setEditor({
      articleId: currentArticle.id,
      baseVersion: currentArticle.version,
      draft: { ...base },
      base,
    });
    setEditorError("");
  }, [currentArticle, editor]);

  const changeDraft = useCallback((draft: ArticleDraft) => {
    setEditor((previous) => (previous ? { ...previous, draft } : previous));
  }, []);

  const saveEditor = useCallback(async (): Promise<boolean> => {
    if (!editor) return true;
    if (!isDraftDirty(editor)) {
      setEditor(null);
      setEditorError("");
      return true;
    }
    const title = editor.draft.title.trim();
    if (!title) {
      setEditorError("标题不能为空");
      return false;
    }
    const paragraphs = parsePastedText(editor.draft.text);
    if (!paragraphs.length) {
      setEditorError("正文不能为空");
      return false;
    }
    setSaving(true);
    setEditorError("");
    try {
      const updated = await api.updateArticle({
        id: editor.articleId,
        title,
        topic: editor.draft.topic,
        paragraphs,
        expectedVersion: editor.baseVersion,
      });
      setCurrentArticle(updated);
      setEditor(null);
      await refreshAll();
      notify("已保存正文");
      return true;
    } catch (cause) {
      const message = errorMessage(cause);
      setEditorError(message);
      notify(message, "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [api, editor, refreshAll, notify]);

  const cancelEdit = useCallback(() => {
    if (!editor) return;
    if (isDraftDirty(editor) && !window.confirm("放弃未保存的修改？")) return;
    setEditor(null);
    setEditorError("");
  }, [editor]);

  const selectArticle = useCallback(
    async (sectionId: string, articleId: number) => {
      if (editor) {
        const saved = await saveEditor();
        if (!saved) return;
      }
      try {
        await loadAndSetArticle(sectionId, articleId);
        setExpanded((previous) => new Set(previous).add(sectionId));
      } catch (cause) {
        notify(errorMessage(cause), "error");
      }
    },
    [editor, saveEditor, loadAndSetArticle, notify],
  );

  const openArticleFromLibrary = useCallback(
    async (articleId: number, paragraphStart?: number, paragraphEnd?: number) => {
      if (editor) {
        const saved = await saveEditor();
        if (!saved) return;
      }
      try {
        const { article, memberships: nextMemberships } = await fetchArticle(
          api,
          articleId,
        );
        setView("reader");
        setCurrentArticle(article);
        setCurrentSectionId(nextMemberships[0]?.id ?? null);
        setParagraphTarget(
          paragraphStart === undefined
            ? null
            : {
                articleId,
                paragraphStart,
                paragraphEnd: paragraphEnd ?? paragraphStart,
              },
        );
        setEditor(null);
        setEditorError("");
        if (nextMemberships[0]) {
          setExpanded((previous) => new Set(previous).add(nextMemberships[0].id));
        }
        writeJson(LAST_KEY, {
          sectionId: nextMemberships[0]?.id ?? null,
          articleId,
        });
      } catch (cause) {
        notify(errorMessage(cause), "error");
      }
    },
    [api, editor, saveEditor, notify],
  );

  const navigate = useCallback(
    async (next: AppView) => {
      if (next === view) return;
      if (editor) {
        const saved = await saveEditor();
        if (!saved) return;
      }
      setView(next);
      if (next === "library") {
        setLibraryLoading(true);
        try {
          await refreshAll();
        } catch (cause) {
          notify(errorMessage(cause), "error");
        } finally {
          setLibraryLoading(false);
        }
      }
    },
    [view, editor, saveEditor, refreshAll, notify],
  );

  const openPicker = useCallback(
    (sectionId: string, initialIds: number[], opener: HTMLElement | null) => {
      if (!sectionId) return;
      setPicker({ targetSectionId: sectionId, initialIds, returnFocus: opener });
    },
    [],
  );

  const handleAdded = useCallback(
    async (articleIds: number[], targetSectionId: string, added: number) => {
      const data = await refreshAll();
      setExpanded((previous) => new Set(previous).add(targetSectionId));
      const targetName =
        data.sections.find((section) => section.id === targetSectionId)?.name ??
        "分区";
      notify(
        added > 0
          ? `已加入「${targetName}」${added} 篇`
          : `「${targetName}」已包含所选文章`,
      );
      if (view === "reader" && !currentArticle && articleIds[0]) {
        try {
          await loadAndSetArticle(targetSectionId, articleIds[0]);
          setExpanded((previous) => new Set(previous).add(targetSectionId));
        } catch (cause) {
          notify(errorMessage(cause), "error");
        }
      }
    },
    [refreshAll, notify, view, currentArticle, loadAndSetArticle],
  );

  const removeArticle = useCallback(
    async (section: Section, article: ArticleSummary) => {
      if (editor && editor.articleId === article.id) {
        const saved = await saveEditor();
        if (!saved) return;
      }
      try {
        const list = await api.listSectionArticles(section.id);
        const index = list.findIndex((item) => item.id === article.id);
        await api.removeArticleFromSection(section.id, article.id);
        await refreshAll();
        if (currentArticle?.id === article.id && currentSectionId === section.id) {
          const remaining = list.filter((item) => item.id !== article.id);
          const next = remaining[index] ?? remaining[index - 1] ?? null;
          if (next) {
            await loadAndSetArticle(section.id, next.id);
          } else {
            setCurrentArticle(null);
            setEditor(null);
            writeJson(LAST_KEY, { sectionId: section.id, articleId: null });
          }
        }
        notify(`已从「${section.name}」移除，资料库原文保留`);
      } catch (cause) {
        notify(errorMessage(cause), "error");
      }
    },
    [
      api,
      editor,
      saveEditor,
      currentArticle,
      currentSectionId,
      refreshAll,
      loadAndSetArticle,
      notify,
    ],
  );

  const createSection = useCallback(
    async (name: string) => {
      const created = await api.createSection(name);
      await refreshAll();
      setExpanded((previous) => new Set(previous).add(created.id));
      notify(`已新建分区「${created.name}」`);
    },
    [api, refreshAll, notify],
  );

  const renameSection = useCallback(
    async (section: Section, name: string) => {
      await api.renameSection(section.id, name);
      await refreshAll();
      notify(`分区已重命名为「${name}」`);
    },
    [api, refreshAll, notify],
  );

  const collectWord = useCallback(
    async (input: CollectWordInput): Promise<CollectOutcome> => {
      try {
        const result = await api.addWordFavorite({
          ...input,
          today: localDateKey(),
        });
        notify(
          result.created
            ? `已收藏词语「${input.word}」`
            : `「${input.word}」与原句已在生词本中`,
        );
        return result.created ? "created" : "existing";
      } catch (cause) {
        notify(`收藏词语失败：${errorMessage(cause)}`, "error");
        return "error";
      }
    },
    [api, notify],
  );

  const collectLongSentence = useCallback(
    async (input: CollectLongSentenceInput): Promise<CollectOutcome> => {
      if (
        (input.wholeParagraph ||
          shouldConfirmLongSentence(
            input.sourceText,
            input.paragraphStart,
            input.paragraphEnd,
          )) &&
        !window.confirm("是否加入长难句复习？")
      ) {
        return "cancelled";
      }
      try {
        const result = await api.addLongSentenceFavorite({
          sourceText: input.sourceText,
          translation: input.translation ?? null,
          analysis: input.analysis ? packAnalysis(input.analysis) : null,
          articleId: input.articleId,
          paragraphStart: input.paragraphStart,
          paragraphEnd: input.paragraphEnd,
        });
        notify(
          result.created
            ? "已收藏长难句，可在收藏页查看"
            : "这条长难句已在收藏中，未重复新增",
        );
        return result.created ? "created" : "existing";
      } catch (cause) {
        notify(`收藏长难句失败：${errorMessage(cause)}`, "error");
        return "error";
      }
    },
    [api, notify],
  );

  const onPasteCreated = useCallback(
    async (article: ArticleDetail) => {
      const data = await refreshAll();
      const defaultSection =
        data.sections.find((section) => article.sectionIds.includes(section.id)) ??
        data.sections[0];
      if (defaultSection) {
        setExpanded((previous) => new Set(previous).add(defaultSection.id));
      }
      if (view === "reader" && !currentArticle && defaultSection) {
        await loadAndSetArticle(defaultSection.id, article.id);
      }
      notify(
        `已创建《${article.title}》${
          defaultSection ? `，并加入「${defaultSection.name}」` : ""
        }`,
      );
    },
    [refreshAll, view, currentArticle, loadAndSetArticle, notify],
  );

  const defaultSectionName = sections[0]?.name ?? "我的阅读";
  const runtimeLabel = isTauriRuntime() ? "本机 SQLite" : "浏览器预览";

  return (
    <KonstaApp theme="ios">
      <div className="shell">
        <header>
          <div className="brand">
            <span>
              <BookOpen size={21} />
            </span>
            阅间
          </div>
          <i />
          <span className="crumb">{VIEW_LABELS[view]}</span>
          <div className="local">
            <b />
            {runtimeLabel}
          </div>
        </header>

        <div className="workspace">
          <nav aria-label="功能导航">
            <button
              type="button"
              className={`navbtn${view === "reader" ? " current" : ""}`}
              title="阅读工作台"
              aria-current={view === "reader" ? "page" : undefined}
              onClick={() => void navigate("reader")}
            >
              <BookOpen />
              <small>精读</small>
            </button>
            <button
              type="button"
              className={`navbtn${view === "library" ? " current" : ""}`}
              title="资料库"
              aria-current={view === "library" ? "page" : undefined}
              onClick={() => void navigate("library")}
            >
              <LibraryBig />
              <small>资料库</small>
            </button>
            <button
              type="button"
              className={`navbtn${view === "collection" ? " current" : ""}`}
              title="收藏"
              aria-current={view === "collection" ? "page" : undefined}
              onClick={() => void navigate("collection")}
            >
              <Bookmark />
              <small>收藏</small>
            </button>
            <button
              type="button"
              className={`navbtn${view === "review" ? " current" : ""}`}
              title="复习"
              aria-current={view === "review" ? "page" : undefined}
              onClick={() => void navigate("review")}
            >
              <CalendarCheck />
              <small>复习</small>
            </button>
            <button
              type="button"
              className={`navbtn${view === "essay" ? " current" : ""}`}
              title="作文批改"
              aria-current={view === "essay" ? "page" : undefined}
              onClick={() => void navigate("essay")}
            >
              <PenLine />
              <small>作文批改</small>
            </button>
            <button
              type="button"
              className={`navbtn${view === "settings" ? " current" : ""}`}
              title="设置"
              aria-current={view === "settings" ? "page" : undefined}
              onClick={() => void navigate("settings")}
            >
              <Settings />
              <small>设置</small>
            </button>
          </nav>

          {view === "reader" && listOpen && (
            <SectionList
              sections={sections}
              articlesBySection={articlesBySection}
              currentSectionId={currentSectionId}
              currentArticleId={currentArticle?.id ?? null}
              expanded={expanded}
              onToggleSection={(id) =>
                setExpanded((previous) => {
                  const next = new Set(previous);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onSelectArticle={(sectionId, articleId) =>
                void selectArticle(sectionId, articleId)
              }
              onOpenPicker={(sectionId, opener) =>
                openPicker(sectionId, [], opener)
              }
              onCreateSection={(opener) =>
                setSectionDialog({ mode: "create", returnFocus: opener })
              }
              onRenameSection={(section, opener) =>
                setSectionDialog({
                  mode: "rename",
                  section,
                  returnFocus: opener,
                })
              }
              onRemoveArticle={(section, article) =>
                void removeArticle(section, article)
              }
              onCollapse={() => setListOpen(false)}
            />
          )}

          {view === "reader" ? (
            loading ? (
              <main>
                <div className="busy">正在加载本机数据…</div>
              </main>
            ) : (
              <ReaderView
                api={api}
                notify={notify}
                article={currentArticle}
                paragraphTarget={paragraphTarget}
                sectionName={
                  sections.find((section) => section.id === currentSectionId)?.name ??
                  null
                }
                currentSectionId={currentSectionId}
                editor={editor}
                saving={saving}
                editorError={editorError}
                listOpen={listOpen}
                sideOpen={sideOpen}
                onExpandList={() => setListOpen(true)}
                onExpandSide={() => setSideOpen(true)}
                onStartEdit={startEdit}
                onSaveEditor={() => void saveEditor()}
                onCancelEdit={cancelEdit}
                onChangeDraft={changeDraft}
                onOpenPicker={(sectionId, opener) =>
                  openPicker(sectionId, [], opener)
                }
                onOpenPaste={(opener) => setPasteDialog({ returnFocus: opener })}
                onGoLibrary={() => void navigate("library")}
                onAskWord={askWord}
                onTranslateSelection={(selection) => {
                  openAssistantSide();
                  assistant.translateSelection(selection);
                }}
                onAnalyzeSelection={(selection) => {
                  openAssistantSide();
                  assistant.analyzeSelection(selection);
                }}
                onTranslateParagraph={(index) => {
                  openAssistantSide();
                  assistant.translateParagraph(index);
                }}
                onTranslateArticle={() => {
                  openAssistantSide();
                  assistant.translateArticle();
                }}
              />
            )
          ) : view === "library" ? (
            <LibraryPage
              api={api}
              groups={libraryGroups}
              sections={sections}
              currentSectionId={currentSectionId}
              loading={libraryLoading}
              onOpenArticle={(articleId) => void openArticleFromLibrary(articleId)}
              onOpenPicker={(target, initialIds, opener) =>
                openPicker(target, initialIds, opener)
              }
              onOpenPaste={(opener) => setPasteDialog({ returnFocus: opener })}
              onChanged={async (updated) => {
                await refreshAll();
                if (updated && currentArticle?.id === updated.id) {
                  setCurrentArticle(updated);
                }
              }}
              notify={notify}
            />
          ) : view === "collection" ? (
            <CollectionPage
              api={api}
              language={languageService}
              onOpenArticle={(articleId, paragraphStart, paragraphEnd) =>
                void openArticleFromLibrary(articleId, paragraphStart, paragraphEnd)
              }
              notify={notify}
            />
          ) : view === "review" ? (
            <ReviewPage
              api={api}
              language={languageService}
              coach={coach}
              onOpenArticle={(articleId, paragraphStart, paragraphEnd) =>
                void openArticleFromLibrary(articleId, paragraphStart, paragraphEnd)
              }
              notify={notify}
            />
          ) : view === "essay" ? (
            <EssayPage
              service={essayService ?? builtinEssayService}
              session={essaySession}
              onSessionChange={setEssaySession}
            />
          ) : (
            <SettingsPage
              api={api}
              notify={notify}
              onDataDeleted={() => {
                setSections([]);
                setArticlesBySection({});
                setLibraryGroups([]);
                setExpanded(new Set());
                setCurrentSectionId(null);
                setCurrentArticle(null);
                setParagraphTarget(null);
                setEditor(null);
                writeJson(LAST_KEY, { sectionId: null, articleId: null });
              }}
            />
          )}

          {view === "reader" && sideOpen && (
            <Inspector
              assistant={assistant}
              article={currentArticle}
              onCollectWord={collectWord}
              onCollectLongSentence={collectLongSentence}
              onCollapse={() => setSideOpen(false)}
            />
          )}
        </div>

        {toast && (
          <div className={`toast${toast.kind === "error" ? " error" : ""}`} role="status">
            {toast.text}
          </div>
        )}

        <LibraryPicker
          api={api}
          open={picker !== null}
          sections={sections}
          targetSectionId={picker?.targetSectionId ?? null}
          initialSelectedIds={picker?.initialIds ?? []}
          onClose={() => setPicker(null)}
          onAdded={handleAdded}
          onGoLibrary={() => {
            setPicker(null);
            void navigate("library");
          }}
          returnFocus={picker?.returnFocus ?? null}
        />

        <SectionNameDialog
          open={sectionDialog !== null}
          mode={sectionDialog?.mode ?? "create"}
          initialName={sectionDialog?.section?.name ?? ""}
          onClose={() => setSectionDialog(null)}
          returnFocus={sectionDialog?.returnFocus ?? null}
          onSave={async (name) => {
            if (sectionDialog?.mode === "rename" && sectionDialog.section) {
              await renameSection(sectionDialog.section, name);
            } else {
              await createSection(name);
            }
          }}
        />

        <PasteDialog
          api={api}
          open={pasteDialog !== null}
          defaultSectionName={defaultSectionName}
          onClose={() => setPasteDialog(null)}
          onCreated={onPasteCreated}
          returnFocus={pasteDialog?.returnFocus ?? null}
        />
      </div>
    </KonstaApp>
  );
}