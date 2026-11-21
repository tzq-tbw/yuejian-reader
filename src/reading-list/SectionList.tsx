import { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  LibraryBig,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  SquarePen,
  Trash2,
  FolderPlus,
} from "lucide-react";
import type { ArticleSummary, Section } from "../data/types";
import { IconButton } from "../components/IconButton";
import { PopoverMenu } from "../components/PopoverMenu";

interface SectionListProps {
  sections: Section[];
  articlesBySection: Record<string, ArticleSummary[]>;
  currentSectionId: string | null;
  currentArticleId: number | null;
  expanded: Set<string>;
  onToggleSection: (id: string) => void;
  onSelectArticle: (sectionId: string, articleId: number) => void;
  onOpenPicker: (sectionId: string, opener: HTMLElement | null) => void;
  onCreateSection: (opener: HTMLElement | null) => void;
  onRenameSection: (section: Section, opener: HTMLElement | null) => void;
  onRemoveArticle: (section: Section, article: ArticleSummary) => void;
  onCollapse: () => void;
}

export function SectionList({
  sections,
  articlesBySection,
  currentSectionId,
  currentArticleId,
  expanded,
  onToggleSection,
  onSelectArticle,
  onOpenPicker,
  onCreateSection,
  onRenameSection,
  onRemoveArticle,
  onCollapse,
}: SectionListProps) {
  return (
    <aside className="library" aria-label="阅读列表">
      <ListHeader
        sections={sections}
        currentSectionId={currentSectionId}
        onOpenPicker={onOpenPicker}
        onCreateSection={onCreateSection}
        onCollapse={onCollapse}
      />
      <div className="listScroll">
        {sections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            articles={articlesBySection[section.id] ?? []}
            expanded={expanded.has(section.id)}
            currentSectionId={currentSectionId}
            currentArticleId={currentArticleId}
            onToggle={() => onToggleSection(section.id)}
            onSelectArticle={(articleId) => onSelectArticle(section.id, articleId)}
            onOpenPicker={(opener) => onOpenPicker(section.id, opener)}
            onRename={(opener) => onRenameSection(section, opener)}
            onRemove={(article) => onRemoveArticle(section, article)}
          />
        ))}
      </div>
    </aside>
  );
}

function ListHeader({
  sections,
  currentSectionId,
  onOpenPicker,
  onCreateSection,
  onCollapse,
}: {
  sections: Section[];
  currentSectionId: string | null;
  onOpenPicker: (sectionId: string, opener: HTMLElement | null) => void;
  onCreateSection: (opener: HTMLElement | null) => void;
  onCollapse: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const targetSection = currentSectionId ?? sections[0]?.id ?? "";

  return (
    <div className="sectitle">
      阅读列表
      <div className="sectitleActions">
        <div className="menuHost">
          <IconButton
            ref={triggerRef}
            label="添加分区或文章"
            icon={Plus}
            expanded={menuOpen}
            hasPopup
            onClick={() => setMenuOpen((open) => !open)}
          />
          <PopoverMenu
            open={menuOpen}
            label="添加"
            onClose={() => setMenuOpen(false)}
            align="right"
            items={[
              {
                label: "从资料库添加",
                icon: LibraryBig,
                onSelect: () => onOpenPicker(targetSection, triggerRef.current),
              },
              {
                label: "新建分区",
                icon: FolderPlus,
                onSelect: () => onCreateSection(triggerRef.current),
              },
            ]}
          />
        </div>
        <IconButton label="收起文章列表" icon={PanelLeftClose} onClick={onCollapse} />
      </div>
    </div>
  );
}

function SectionBlock({
  section,
  articles,
  expanded,
  currentSectionId,
  currentArticleId,
  onToggle,
  onSelectArticle,
  onOpenPicker,
  onRename,
  onRemove,
}: {
  section: Section;
  articles: ArticleSummary[];
  expanded: boolean;
  currentSectionId: string | null;
  currentArticleId: number | null;
  onToggle: () => void;
  onSelectArticle: (articleId: number) => void;
  onOpenPicker: (opener: HTMLElement | null) => void;
  onRename: (opener: HTMLElement | null) => void;
  onRemove: (article: ArticleSummary) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const folderId = `section-${section.id}`;

  return (
    <div className="sectionBlock">
      <div className="sectionHead">
        <button
          type="button"
          className="sectionFold"
          aria-expanded={expanded}
          aria-controls={folderId}
          onClick={onToggle}
        >
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <FolderOpen size={16} />
          <span className="sectionName">{section.name}</span>
          <span className="sectionCount" aria-label={`${section.articleCount} 篇`}>
            {section.articleCount}
          </span>
        </button>
        <div className="menuHost">
          <button
            ref={triggerRef}
            type="button"
            className="rowMenuBtn"
            aria-label={`分区菜单：${section.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal size={16} />
          </button>
          <PopoverMenu
            open={menuOpen}
            label={`分区菜单：${section.name}`}
            onClose={() => setMenuOpen(false)}
            align="right"
            items={[
              {
                label: "从资料库添加",
                icon: LibraryBig,
                onSelect: () => onOpenPicker(triggerRef.current),
              },
              {
                label: "重命名分区",
                icon: SquarePen,
                onSelect: () => onRename(triggerRef.current),
              },
            ]}
          />
        </div>
      </div>
      {expanded && (
        <div id={folderId} role="group" aria-label={section.name}>
          {articles.map((article) => (
            <ArticleRow
              key={article.id}
              article={article}
              active={
                currentSectionId === section.id && currentArticleId === article.id
              }
              onSelect={() => onSelectArticle(article.id)}
              onRemove={() => onRemove(article)}
            />
          ))}
          {!articles.length && (
            <div className="emptySection">
              这个分区还没有文章。
              <div>
                <button type="button" onClick={() => onOpenPicker(triggerRef.current)}>
                  从资料库添加
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ArticleRow({
  article,
  active,
  onSelect,
  onRemove,
}: {
  article: ArticleSummary;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="entryRow">
      <button
        type="button"
        className={`entry${active ? " chosen" : ""}`}
        aria-current={active ? "page" : undefined}
        onClick={onSelect}
      >
        <small>
          {article.suiteTitle ?? "粘贴文章"}
          {article.sequenceNo != null ? ` · 第 ${article.sequenceNo} 篇` : ""}
          {article.examType ? ` · ${article.examType}` : ""} · {article.topic}
        </small>
        <strong>{article.title}</strong>
      </button>
      <div className="menuHost">
        <button
          ref={triggerRef}
          type="button"
          className="rowMenuBtn"
          aria-label={`文章菜单：${article.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreHorizontal size={16} />
        </button>
        <PopoverMenu
          open={menuOpen}
          label={`文章菜单：${article.title}`}
          onClose={() => setMenuOpen(false)}
          align="right"
          items={[
            {
              label: "从分区移除",
              icon: Trash2,
              danger: true,
              onSelect: onRemove,
            },
          ]}
        />
      </div>
    </div>
  );
}