import {
  type AddResult,
  type ArticleDetail,
  type ArticleSummary,
  type ImportArticleInput,
  type ImportSuiteInput,
  type ImportSuiteResult,
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
  suiteId: string | null;
  examType: string | null;
  sequenceNo: number | null;
  pageRange: string | null;
  questionRange: string | null;
  questionArea: string | null;
}

interface MockSuite {
  id: string;
  title: string;
  source: string;
  fingerprint: string;
  examLevel: string | null;
  sortOrder: number;
  createdAt: string;
}

interface MockMembership {
  sectionId: string;
  articleId: number;
  position: number;
  addedAt: string;
}

interface MockState {
  nextArticleId: number;
  nextSuiteId: number;
  sections: Array<{ id: string; name: string; sortOrder: number; createdAt: string }>;
  suites: MockSuite[];
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
    nextSuiteId: 1,
    sections: [
      { id: "default-section", name: "我的阅读", sortOrder: 10, createdAt: now },
    ],
    suites: [],
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
  const suite = article.suiteId
    ? state.suites.find((item) => item.id === article.suiteId)
    : undefined;
  return {
    id: article.id,
    title: article.title,
    topic: article.topic,
    version: article.version,
    paragraphCount: article.paragraphs.length,
    wordCount: countWords(article.paragraphs.join(" ")),
    suiteId: article.suiteId,
    suiteTitle: suite?.title ?? null,
    examType: article.examType,
    sequenceNo: article.sequenceNo,
    pageRange: article.pageRange,
    questionRange: article.questionRange,
    sectionCount: state.memberships.filter((m) => m.articleId === article.id).length,
    updatedAt: article.updatedAt,
  };
}

function detail(state: MockState, article: MockArticle): ArticleDetail {
  return {
    ...summary(state, article),
    paragraphs: [...article.paragraphs],
    source: article.suiteId ? "suite" : "paste",
    createdAt: article.createdAt,
    sectionIds: state.memberships
      .filter((m) => m.articleId === article.id)
      .map((m) => m.sectionId),
    questionArea: article.questionArea,
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
  if (!Array.isArray(state.suites)) state.suites = [];
  if (typeof state.nextSuiteId !== "number") state.nextSuiteId = 1;
  for (const article of state.articles) {
    const legacy = article as Partial<MockArticle>;
    article.suiteId = legacy.suiteId ?? null;
    article.examType = legacy.examType ?? null;
    article.sequenceNo = legacy.sequenceNo ?? null;
    article.pageRange = legacy.pageRange ?? null;
    article.questionRange = legacy.questionRange ?? null;
    article.questionArea = legacy.questionArea ?? null;
  }

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
      const matches = (article: MockArticle) =>
        !needle || article.title.toLowerCase().includes(needle);
      const groups: LibraryGroup[] = [];
      const suites = [...state.suites].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt),
      );
      for (const suite of suites) {
        const articles = state.articles
          .filter((article) => article.suiteId === suite.id && matches(article))
          .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0) || a.id - b.id)
          .map((article) => summary(state, article));
        if (articles.length) {
          groups.push({
            suiteId: suite.id,
            title: suite.title,
            source: suite.source,
            articles,
          });
        }
      }
      const standalone = state.articles
        .filter((article) => article.suiteId === null && matches(article))
        .sort((a, b) => b.id - a.id)
        .map((article) => summary(state, article));
      if (standalone.length) {
        groups.push({
          suiteId: null,
          title: "单篇材料",
          source: "paste",
          articles: standalone,
        });
      }
      return groups;
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
        suiteId: null,
        examType: null,
        sequenceNo: null,
        pageRange: null,
        questionRange: null,
        questionArea: null,
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

    async importSuite(input: ImportSuiteInput): Promise<ImportSuiteResult> {
      const title = input.title.trim();
      const fingerprint = input.fingerprint.trim();
      if (!title) throw new Error("套卷名称不能为空");
      if (!fingerprint) throw new Error("缺少试卷指纹，无法安全去重");
      if (!input.articles.length) throw new Error("没有可导入的阅读文章");
      if (input.articles.length > 20) throw new Error("一次导入的文章过多");

      const prepared = input.articles.map((article: ImportArticleInput, index) => {
        const articleTitle = article.title.trim();
        if (!articleTitle) throw new Error(`第 ${index + 1} 篇文章标题不能为空`);
        const examType = article.examType.trim();
        if (!examType) throw new Error(`《${articleTitle}》缺少题型`);
        if (!Number.isInteger(article.sequenceNo) || article.sequenceNo <= 0) {
          throw new Error(`《${articleTitle}》篇次不合法`);
        }
        const paragraphs = article.paragraphs
          .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
          .filter(Boolean);
        if (!paragraphs.length) throw new Error(`《${articleTitle}》正文为空`);
        let questionArea: string | null = null;
        if (article.questionArea?.trim()) {
          try {
            questionArea = JSON.stringify(JSON.parse(article.questionArea));
          } catch {
            throw new Error(`《${articleTitle}》题目区格式不合法`);
          }
        }
        return {
          title: articleTitle,
          examType,
          sequenceNo: article.sequenceNo,
          pageRange: article.pageRange?.trim() || null,
          questionRange: article.questionRange?.trim() || null,
          questionArea,
          paragraphs,
          topic: classifyTopic(paragraphs.join(" ")),
        };
      });

      const sequences = new Set<number>();
      for (const article of prepared) {
        if (sequences.has(article.sequenceNo)) {
          throw new Error(`题号重复：第 ${article.sequenceNo} 篇在一套卷内出现了两次`);
        }
        sequences.add(article.sequenceNo);
      }

      const existing = state.suites.find((suite) => suite.fingerprint === fingerprint);
      if (existing) {
        const articles = state.articles
          .filter((article) => article.suiteId === existing.id)
          .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0) || a.id - b.id)
          .map((article) => summary(state, article));
        return {
          suiteId: existing.id,
          title: existing.title,
          created: false,
          articles,
        };
      }

      const snapshot = JSON.stringify(state);
      try {
        const now = new Date().toISOString();
        const maxOrder = state.suites.reduce((max, suite) => Math.max(max, suite.sortOrder), 0);
        const suite: MockSuite = {
          id: `suite-${state.nextSuiteId++}`,
          title,
          source: "pdf",
          fingerprint,
          examLevel: input.examLevel?.trim() || null,
          sortOrder: maxOrder + 10,
          createdAt: now,
        };
        state.suites.push(suite);
        const target = firstSection(state);
        let position = target
          ? state.memberships
              .filter((m) => m.sectionId === target.id)
              .reduce((max, m) => Math.max(max, m.position), 0)
          : 0;
        const created: ArticleSummary[] = [];
        for (const article of prepared) {
          const row: MockArticle = {
            id: state.nextArticleId++,
            title: article.title,
            paragraphs: article.paragraphs,
            topic: article.topic,
            version: 1,
            createdAt: now,
            updatedAt: now,
            suiteId: suite.id,
            examType: article.examType,
            sequenceNo: article.sequenceNo,
            pageRange: article.pageRange,
            questionRange: article.questionRange,
            questionArea: article.questionArea,
          };
          state.articles.push(row);
          if (target) {
            position += 1;
            state.memberships.push({
              sectionId: target.id,
              articleId: row.id,
              position,
              addedAt: now,
            });
          }
          created.push(summary(state, row));
        }
        persist();
        return { suiteId: suite.id, title, created: true, articles: created };
      } catch (cause) {
        state = JSON.parse(snapshot) as MockState;
        throw cause;
      }
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