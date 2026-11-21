import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  LibraryBig,
  Search,
} from "lucide-react";
import type { LibraryGroup, ReaderApi, Section } from "../data/types";
import { Modal } from "../components/Modal";
import { errorMessage } from "../utils/error";

interface LibraryPickerProps {
  api: ReaderApi;
  open: boolean;
  sections: Section[];
  targetSectionId: string | null;
  initialSelectedIds?: number[];
  onClose: () => void;
  onAdded: (
    articleIds: number[],
    targetSectionId: string,
    added: number,
  ) => Promise<void> | void;
  onGoLibrary: () => void;
  returnFocus?: HTMLElement | null;
}

function groupKey(group: LibraryGroup) {
  return group.suiteId ?? "standalone";
}

export function LibraryPicker({
  api,
  open,
  sections,
  targetSectionId,
  initialSelectedIds = [],
  onClose,
  onAdded,
  onGoLibrary,
  returnFocus,
}: LibraryPickerProps) {
  const defaultTarget = targetSectionId ?? sections[0]?.id ?? "";
  const [target, setTarget] = useState(defaultTarget);
  const [groups, setGroups] = useState<LibraryGroup[]>([]);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTarget(defaultTarget);
    setSearch("");
    setError("");
    setBusy(false);
    // 每次打开都以本次传入的初始勾选重建选择，避免沿用上次遗留的选中项。
    setSelected(new Set(initialSelectedIds));
    setAddedIds(new Set());
    setLoading(true);
    let cancelled = false;
    api
      .listLibrary()
      .then((result) => {
        if (cancelled) return;
        setGroups(result);
        setExpanded(new Set(result.map(groupKey)));
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
    // initialSelectedIds 只在打开时读取，避免父组件刷新导致选择被重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !target) return;
    let cancelled = false;
    api
      .listSectionArticles(target)
      .then((articles) => {
        if (cancelled) return;
        const ids = new Set(articles.map((a) => a.id));
        setAddedIds(ids);
        // 已在目标分区的文章不可勾选；用户本轮新勾选的选择保持不变。
        setSelected(
          (previous) => new Set([...previous].filter((id) => !ids.has(id))),
        );
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [open, target, api]);

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

  const addableSelected = [...selected].filter((id) => !addedIds.has(id));

  function toggleGroup(key: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleArticle(id: number) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetSelection() {
    setSelected(new Set());
    setAddedIds(new Set());
  }

  function close() {
    resetSelection();
    onClose();
  }

  async function add() {
    if (!target || !addableSelected.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.addArticlesToSection(target, addableSelected);
      await onAdded(addableSelected, target, result.added);
      resetSelection();
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const libraryIsEmpty = !loading && groups.length === 0;

  return (
    <Modal
      open={open}
      title="从资料库添加"
      onClose={close}
      wide
      returnFocus={returnFocus}
    >
      <p className="sub">
        选择目标分区，勾选一篇或多篇加入。已在目标分区的文章不会重复添加。
      </p>
      <div className="pickerTop">
        <label htmlFor="picker-target">添加到分区</label>
        <select
          id="picker-target"
          value={target}
          disabled={busy || !sections.length}
          onChange={(event) => setTarget(event.target.value)}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </div>
      <div className="pickerSearch">
        <label htmlFor="picker-search">按标题查找</label>
        <div style={{ position: "relative" }}>
          <Search
            size={15}
            style={{ position: "absolute", left: 10, top: 11, color: "#8493a6" }}
          />
          <input
            id="picker-search"
            type="text"
            data-autofocus
            value={search}
            disabled={busy || loading}
            placeholder="输入文章标题"
            style={{ paddingLeft: 32 }}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {loading && <p className="busy">正在加载资料库…</p>}

      {!loading && libraryIsEmpty && (
        <div className="libEmpty" style={{ margin: "28px auto 18px" }}>
          <LibraryBig size={30} />
          <h2>资料库还是空的</h2>
          <p>先粘贴一篇文章，再回来加入分区。</p>
          <button type="button" onClick={() => { resetSelection(); onGoLibrary(); }}>
            去资料库导入
          </button>
        </div>
      )}

      {!loading && !libraryIsEmpty && (
        <div className="pickerGroups">
          {filtered.map((group) => {
            const key = groupKey(group);
            const isExpanded = expanded.has(key);
            return (
              <div className="pickerGroup" key={key}>
                <button
                  type="button"
                  className="pickerGroupHead"
                  aria-expanded={isExpanded}
                  onClick={() => toggleGroup(key)}
                >
                  {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <LibraryBig size={15} />
                  {group.title}
                  <span className="count">{group.articles.length} 篇</span>
                </button>
                {isExpanded && (
                  <div className="pickerRows">
                    {group.articles.map((article) => {
                      const added = addedIds.has(article.id);
                      return (
                        <label className="pickRow" key={article.id}>
                          <input
                            type="checkbox"
                            checked={added || selected.has(article.id)}
                            disabled={added || busy}
                            onChange={() => toggleArticle(article.id)}
                          />
                          <span>
                            <span className="pickTitle">{article.title}</span>
                            <span className="pickMeta">
                              {article.topic}
                              {article.sequenceNo != null
                                ? ` · 第 ${article.sequenceNo} 篇`
                                : ""}{" "}
                              · {article.paragraphCount} 段 · 第 {article.version} 版
                            </span>
                          </span>
                          {added && <span className="addedBadge">已添加</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {!filtered.length && (
            <p className="busy">没有匹配的文章。</p>
          )}
        </div>
      )}

      {error && <div className="error" role="alert">{error}</div>}

      <div className="pickerFoot">
        <span className="count">
          已选 {addableSelected.length} 篇
          {addedIds.size ? ` · 目标分区已有 ${addedIds.size} 篇` : ""}
        </span>
        <div className="actions" style={{ marginTop: 0 }}>
          <button type="button" onClick={close} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || !addableSelected.length || !target}
            onClick={add}
          >
            {busy ? "添加中…" : "添加"}
          </button>
        </div>
      </div>
    </Modal>
  );
}