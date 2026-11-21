import { useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  LibraryBig,
  Search,
  SquarePen,
} from "lucide-react";
import type { ArticleDetail, LibraryGroup, ReaderApi, Section } from "../data/types";
import { ArticleEditDialog } from "./ArticleEditDialog";

interface LibraryPageProps {
  api: ReaderApi;
  groups: LibraryGroup[];
  sections: Section[];
  currentSectionId: string | null;
  loading: boolean;
  onOpenArticle: (articleId: number) => void;
  onOpenPicker: (
    targetSectionId: string,
    initialIds: number[],
    opener: HTMLElement | null,
  ) => void;
  onOpenPaste: (opener: HTMLElement | null) => void;
  onChanged: (article?: ArticleDetail) => Promise<void>;
  notify: (text: string, kind?: "info" | "error") => void;
}

function groupKey(group: LibraryGroup) {
  return group.suiteId ?? "standalone";
}

export function LibraryPage({
  api,
  groups,
  sections,
  currentSectionId,
  loading,
  onOpenArticle,
  onOpenPicker,
  onOpenPaste,
  onChanged,
  notify,
}: LibraryPageProps) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editReturnFocus, setEditReturnFocus] = useState<HTMLElement | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({
        ...group,
        articles: group.articles.filter((a) =>
          a.title.toLowerCase().includes(needle),
        ),
      }))
      .filter((group) => group.articles.length > 0);
  }, [groups, search]);

  const totalArticles = groups.reduce((sum, group) => sum + group.articles.length, 0);
  const targetSection = currentSectionId ?? sections[0]?.id ?? "";

  function toggleGroup(key: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSaved(article: ArticleDetail) {
    await onChanged(article);
  }

  return (
    <div className="libraryMain">
      <div className="libTop">
        <h1>资料库</h1>
        <span style={{ color: "#8492a6", fontSize: 12 }}>
          {totalArticles} 篇文章 · 原件保存在本机
        </span>
        <div className="search">
          <Search size={15} />
          <input
            type="text"
            placeholder="按标题查找"
            aria-label="按标题查找资料库文章"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <button
          type="button"
          className="primary"
          onClick={(event) => onOpenPaste(event.currentTarget)}
        >
          <FilePlus2 size={15} /> 粘贴新文章
        </button>
      </div>

      <div className="libScroll">
        <div className="libInner">
          {loading && <p className="busy">正在加载资料库…</p>}

          {!loading && totalArticles === 0 && (
            <div className="libEmpty">
              <LibraryBig size={42} />
              <h2>资料库还是空的</h2>
              <p>
                粘贴一篇英文材料，会生成一张文章卡并保留段落。文章默认加入「我的阅读」，
                之后可在阅读列表中组织到任意分区。
              </p>
              <button
                type="button"
                className="primary"
                onClick={(event) => onOpenPaste(event.currentTarget)}
              >
                粘贴第一篇文章
              </button>
            </div>
          )}

          {!loading && totalArticles > 0 && !filtered.length && (
            <p className="busy">没有匹配的文章。</p>
          )}

          {filtered.map((group) => {
            const key = groupKey(group);
            const isCollapsed = collapsed.has(key);
            return (
              <div className="libGroup" key={key}>
                <button
                  type="button"
                  className="libGroupHead"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleGroup(key)}
                  style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
                >
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  <LibraryBig size={16} />
                  {group.title}
                  <span className="count">{group.articles.length} 篇</span>
                </button>
                {!isCollapsed &&
                  group.articles.map((article) => (
                    <div className="libRow" key={article.id}>
                      <div className="libRowMain">
                        <div className="libRowTitle">{article.title}</div>
                        <div className="libRowMeta">
                          <span className="topic">{article.topic}</span>
                          {article.sequenceNo != null && (
                            <span>第 {article.sequenceNo} 篇</span>
                          )}
                          <span>{article.paragraphCount} 段</span>
                          <span>{article.wordCount} 词</span>
                          <span>第 {article.version} 版</span>
                          <span>
                            已加入 {article.sectionCount} 个分区
                          </span>
                        </div>
                      </div>
                      <div className="libRowActions">
                        <button
                          type="button"
                          className="primary"
                          onClick={() => onOpenArticle(article.id)}
                        >
                          <BookOpen size={14} /> 阅读
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            setEditReturnFocus(event.currentTarget);
                            setEditingId(article.id);
                          }}
                        >
                          <SquarePen size={14} /> 编辑
                        </button>
                        <button
                          type="button"
                          disabled={!sections.length}
                          onClick={(event) =>
                            onOpenPicker(targetSection, [article.id], event.currentTarget)
                          }
                        >
                          <LibraryBig size={14} /> 加入分区
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      </div>

      <ArticleEditDialog
        api={api}
        articleId={editingId}
        onClose={() => setEditingId(null)}
        onSaved={handleSaved}
        notify={notify}
        returnFocus={editReturnFocus}
      />
    </div>
  );
}