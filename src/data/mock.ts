import {
  type AddResult,
  type ArticleDetail,
  type ArticleSummary,
  type LibraryGroup,
  type ReaderApi,
  type Section,
  type UpdateArticleInput,
  UNCATEGORIZED,
} from "./types";
import {
  classifyTopic,
  countWords,
  parsePastedText,
} from "./text";

/**
 * 浏览器预览/测试用的内存实现，数据写入 localStorage。
 * 桌面版始终走 src/data/tauriApi.ts（SQLite）；两者语义保持一致。
 */

interface MockArticle {
  id: number;
  title: string;
  paragraphs: string[];
  topic: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface MockMembership {
  sectionId: string;
  articleId: number;
  position: number;
  addedAt: string;
}

interface MockState {
  nextArticleId: number;
  sections: Array<{ id: string; name: string; sortOrder: number; createdAt: string }>;
  articles: MockArticle[];
  memberships: MockMembership[];
}

const STORAGE_KEY = "yuejian.browser.db";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function defaultState(): MockState {
  const now = new Date().toISOString();
  return {
    nextArticleId: 1,
    sections: [
      { id: "default-section", name: "我的阅读", sortOrder: 10, createdAt: now },
    ],
    articles: [],
    memberships: [],
  };
}

function firstSection(state: MockState) {
  return [...state.sections].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt),
  )[0];
}

function sectionById(state: MockState, id: string) {
  return state.sections.find((s) => s.id === id);
}

function summary(state: MockState, article: MockArticle): ArticleSummary {
  return {
    id: article.id,
    title: article.title,
    topic: article.topic,
    version: article.version,
    paragraphCount: article.paragraphs.length,
    wordCount: countWords(article.paragraphs.join(" ")),
    suiteId: null,
    suiteTitle: null,
    examType: null,
    sequenceNo: null,
    sectionCount: state.memberships.filter((m) => m.articleId === article.id).length,
    updatedAt: article.updatedAt,
  };
}

function detail(state: MockState, article: MockArticle): ArticleDetail {
  return {
    ...summary(state, article),
    paragraphs: [...article.paragraphs],
    source: "paste",
    createdAt: article.createdAt,
    sectionIds: state.memberships
      .filter((m) => m.articleId === article.id)
      .map((m) => m.sectionId),
  };
}

function sectionResult(state: MockState, sectionId: string): Section {
  const section = sectionById(state, sectionId);
  if (!section) throw new Error("找不到这个分区");
  return {
    id: section.id,
    name: section.name,
    sortOrder: section.sortOrder,
    articleCount: state.memberships.filter((m) => m.sectionId === section.id).length,
    createdAt: section.createdAt,
  };
}

export function createMockApi(storage: StorageLike = createMemoryStorage()): ReaderApi {
  let state: MockState;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    state = raw ? (JSON.parse(raw) as MockState) : defaultState();
  } catch {
    state = defaultState();
  }
  if (!state.sections.length) state.sections.push(defaultState().sections[0]);

  const persist = () => storage.setItem(STORAGE_KEY, JSON.stringify(state));

  function articleById(id: number) {
    const article = state.articles.find((a) => a.id === id);
    if (!article) throw new Error("找不到这篇文章");
    return article;
  }

  return {
    async listSections() {
      return [...state.sections]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
        .map((s) => sectionResult(state, s.id));
    },

    async createSection(name: string) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("分区名称不能为空");
      const max = state.sections.reduce((m, s) => Math.max(m, s.sortOrder), 0);
      const section = {
        id: `section-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name: trimmed,
        sortOrder: max + 10,
        createdAt: new Date().toISOString(),
      };
      state.sections.push(section);
      persist();
      return sectionResult(state, section.id);
    },

    async renameSection(id: string, name: string) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("分区名称不能为空");
      const section = sectionById(state, id);
      if (!section) throw new Error("找不到这个分区");
      section.name = trimmed;
      persist();
      return sectionResult(state, id);
    },

    async listSectionArticles(sectionId: string) {
      if (!sectionById(state, sectionId)) throw new Error("找不到这个分区");
      return state.memberships
        .filter((m) => m.sectionId === sectionId)
        .sort((a, b) => a.position - b.position)
        .map((m) => summary(state, articleById(m.articleId)));
    },

    async listLibrary(search?: string) {
      const needle = (search ?? "").trim().toLowerCase();
      const articles = [...state.articles]
        .filter((a) => !needle || a.title.toLowerCase().includes(needle))
        .sort((a, b) => b.id - a.id)
        .map((a) => summary(state, a));
      if (!articles.length) return [];
      return [
        {
          suiteId: null,
          title: "单篇材料",
          source: "paste",
          articles,
        },
      ] satisfies LibraryGroup[];
    },

    async getArticle(id: number) {
      return detail(state, articleById(id));
    },

    async pasteArticle(input: { title: string; text: string; topic?: string }) {
      const title = input.title.trim();
      const paragraphs = parsePastedText(input.text);
      if (!title) throw new Error("标题不能为空");
      if (!paragraphs.length) throw new Error("正文不能为空，至少粘贴一段英文");
      const now = new Date().toISOString();
      const article: MockArticle = {
        id: state.nextArticleId++,
        title,
        paragraphs,
        topic: input.topic?.trim() || classifyTopic(paragraphs.join(" ")),
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      state.articles.push(article);
      const target = firstSection(state);
      if (target) {
        state.memberships.push({
          sectionId: target.id,
          articleId: article.id,
          position: state.memberships.filter((m) => m.sectionId === target.id).length + 1,
          addedAt: now,
        });
      }
      persist();
      return detail(state, article);
    },

    async updateArticle(input: UpdateArticleInput) {
      const article = articleById(input.id);
      const title = input.title.trim();
      const paragraphs = input.paragraphs
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (!title) throw new Error("标题不能为空");
      if (!paragraphs.length) throw new Error("正文不能为空");
      if (article.version !== input.expectedVersion) {
        throw new Error("正文已在其他位置更新，请先保留当前草稿再重新加载");
      }
      article.title = title;
      article.paragraphs = paragraphs;
      article.topic = input.topic.trim() || UNCATEGORIZED;
      article.version += 1;
      article.updatedAt = new Date().toISOString();
      persist();
      return detail(state, article);
    },

    async addArticlesToSection(sectionId: string, articleIds: number[]): Promise<AddResult> {
      if (!sectionById(state, sectionId)) throw new Error("找不到这个分区");
      const existing = new Set(
        state.memberships.filter((m) => m.sectionId === sectionId).map((m) => m.articleId),
      );
      let position = state.memberships
        .filter((m) => m.sectionId === sectionId)
        .reduce((max, m) => Math.max(max, m.position), 0);
      let added = 0;
      const now = new Date().toISOString();
      for (const id of [...new Set(articleIds)]) {
        articleById(id);
        if (existing.has(id)) continue;
        existing.add(id);
        position += 1;
        state.memberships.push({ sectionId, articleId: id, position, addedAt: now });
        added += 1;
      }
      persist();
      return { added };
    },

    async removeArticleFromSection(sectionId: string, articleId: number) {
      if (!sectionById(state, sectionId)) throw new Error("找不到这个分区");
      const before = state.memberships.length;
      state.memberships = state.memberships.filter(
        (m) => !(m.sectionId === sectionId && m.articleId === articleId),
      );
      persist();
      return state.memberships.length < before;
    },

    async getArticleSections(articleId: number) {
      articleById(articleId);
      return state.memberships
        .filter((m) => m.articleId === articleId)
        .map((m) => sectionResult(state, m.sectionId));
    },
  };
}