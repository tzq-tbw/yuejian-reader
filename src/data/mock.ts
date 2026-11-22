import {
  type AddLongSentenceInput,
  type AddResult,
  type AddWordFavoriteInput,
  type ArticleDetail,
  type ArticleSummary,
  type FavoriteAddResult,
  type FillLongSentenceInput,
  type ImportArticleInput,
  type ImportSuiteInput,
  type ImportSuiteResult,
  type ImportWordlistInput,
  type LibraryGroup,
  type LongSentenceFavorite,
  type ReaderApi,
  type ReviewEventInput,
  type ReviewEventResult,
  type Section,
  type UpdateArticleInput,
  type WordFavorite,
  type WordlistSummary,
  type WordlistWords,
  UNCATEGORIZED,
} from "./types";
import {
  classifyTopic,
  countWords,
  parsePastedText,
} from "./text";
import { normalizeCollectionKey } from "../collection/normalize";
import {
  initialSchedule,
  isValidLocalDate,
  localDateKey,
  nextSchedule,
} from "../review/schedule";
import { CET4_WORDS } from "../language/wordlists/cet4";
import { CET6_WORDS } from "../language/wordlists/cet6";
import { POSTGRADUATE_WORDS } from "../language/wordlists/postgraduate";
import { parseWordlist } from "../language/wordlistImport";
import { wordFavoritesCsv } from "../collection/wordExport";
import type {
  AddEssayRevisionInput,
  CreateEssayDocumentInput,
  EssayDocument,
  EssayDocumentSummary,
} from "../essay/types";

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

interface MockWordFavorite {
  id: number;
  word: string;
  normalizedWord: string;
  sentence: string;
  normalizedSentence: string;
  articleId: number | null;
  articleTitle: string;
  paragraphStart: number;
  paragraphEnd: number;
  contextualMeaning: string;
  commonMeaning: string;
  phonetic: string | null;
  partOfSpeech: string | null;
  forms: string[];
  createdAt: string;
}

interface MockLongSentence {
  id: number;
  sourceText: string;
  sourceKey: string;
  translation: string | null;
  analysis: string | null;
  articleId: number | null;
  articleTitle: string;
  paragraphStart: number;
  paragraphEnd: number;
  createdAt: string;
  updatedAt: string;
}

interface MockSchedule {
  favoriteId: number;
  stage: number;
  dueDate: string;
  lastReviewedOn: string | null;
}

interface MockReviewEvent {
  id: number;
  favoriteId: number;
  roundId: string;
  revealId: string;
  rating: "remembered" | "forgotten";
  localDate: string;
  createdAt: string;
}

interface MockWordlist {
  id: string;
  name: string;
  source: string;
  enabled: boolean;
  builtIn: boolean;
  createdAt: string;
  words: string[];
}

interface MockState {
  nextArticleId: number;
  nextSuiteId: number;
  nextWordFavoriteId: number;
  nextLongSentenceId: number;
  nextReviewEventId: number;
  nextEssayDocumentId: number;
  nextEssayRevisionId: number;
  sections: Array<{ id: string; name: string; sortOrder: number; createdAt: string }>;
  suites: MockSuite[];
  articles: MockArticle[];
  memberships: MockMembership[];
  wordFavorites: MockWordFavorite[];
  longSentences: MockLongSentence[];
  schedules: MockSchedule[];
  reviewEvents: MockReviewEvent[];
  wordlists: MockWordlist[];
  essayDocuments: EssayDocument[];
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
    nextWordFavoriteId: 1,
    nextLongSentenceId: 1,
    nextReviewEventId: 1,
    nextEssayDocumentId: 1,
    nextEssayRevisionId: 1,
    sections: [
      { id: "default-section", name: "我的阅读", sortOrder: 10, createdAt: now },
    ],
    suites: [],
    articles: [],
    memberships: [],
    wordFavorites: [],
    longSentences: [],
    schedules: [],
    reviewEvents: [],
    wordlists: [
      {
        id: "cet4",
        name: "四级高频",
        source: "ECDICT · cet4 · 高频前 1600 词",
        enabled: true,
        builtIn: true,
        createdAt: now,
        words: [...CET4_WORDS],
      },
      {
        id: "cet6",
        name: "六级高频",
        source: "ECDICT · cet6 · 高频前 1600 词",
        enabled: true,
        builtIn: true,
        createdAt: now,
        words: [...CET6_WORDS],
      },
      {
        id: "ky",
        name: "考研高频",
        source: "ECDICT · 考研标签 · 高频前 1600 词",
        enabled: true,
        builtIn: true,
        createdAt: now,
        words: [...POSTGRADUATE_WORDS],
      },
    ],
    essayDocuments: [],
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
  state.wordFavorites = Array.isArray(state.wordFavorites) ? state.wordFavorites : [];
  state.longSentences = Array.isArray(state.longSentences) ? state.longSentences : [];
  state.schedules = Array.isArray(state.schedules) ? state.schedules : [];
  state.reviewEvents = Array.isArray(state.reviewEvents) ? state.reviewEvents : [];
  state.wordlists = Array.isArray(state.wordlists) ? state.wordlists : defaultState().wordlists;
  state.essayDocuments = Array.isArray(state.essayDocuments) ? state.essayDocuments : [];
  const nextId = (rows: Array<{ id: number }>, stored: unknown) =>
    Math.max(
      typeof stored === "number" ? stored : 1,
      rows.reduce((max, row) => Math.max(max, row.id), 0) + 1,
    );
  state.nextWordFavoriteId = nextId(state.wordFavorites, state.nextWordFavoriteId);
  state.nextLongSentenceId = nextId(state.longSentences, state.nextLongSentenceId);
  state.nextReviewEventId = nextId(state.reviewEvents, state.nextReviewEventId);
  state.nextEssayDocumentId = nextId(state.essayDocuments, state.nextEssayDocumentId);
  state.nextEssayRevisionId = nextId(
    state.essayDocuments.flatMap((document) => document.revisions),
    state.nextEssayRevisionId,
  );
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

  function essayDocumentById(id: number) {
    const document = state.essayDocuments.find((item) => item.id === id);
    if (!document) throw new Error("找不到这篇作文");
    return document;
  }

  function essaySummaryView(document: EssayDocument): EssayDocumentSummary {
    return {
      id: document.id,
      sequenceNo: document.sequenceNo,
      name: document.name,
      text: document.text,
      revisionCount: document.revisions.length,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  function essayDocumentView(document: EssayDocument): EssayDocument {
    return {
      ...essaySummaryView(document),
      revisions: document.revisions.map((revision) => ({
        ...revision,
        result: {
          ...revision.result,
          issues: revision.result.issues.map((issue) => ({ ...issue })),
        },
      })),
    };
  }

  function validEssayText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("作文正文不能为空");
    if ([...trimmed].length > 30_000) throw new Error("作文过长，请控制在 30000 个字符以内");
    return trimmed;
  }

  function validEssayName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("修改区名称不能为空");
    if ([...trimmed].length > 60) throw new Error("修改区名称不能超过 60 个字符");
    return trimmed;
  }

  function wordView(favorite: MockWordFavorite, today: string): WordFavorite {
    const schedule = state.schedules.find(
      (item) => item.favoriteId === favorite.id,
    );
    const events = state.reviewEvents.filter(
      (event) => event.favoriteId === favorite.id,
    );
    return {
      ...favorite,
      stage: schedule?.stage ?? null,
      dueDate: schedule?.dueDate ?? null,
      forgottenCount: events.filter((event) => event.rating === "forgotten")
        .length,
      forgottenToday: events.some(
        (event) => event.rating === "forgotten" && event.localDate === today,
      ),
    };
  }

  function longSentenceView(item: MockLongSentence): LongSentenceFavorite {
    return {
      id: item.id,
      sourceText: item.sourceText,
      translation: item.translation,
      analysis: item.analysis,
      articleId: item.articleId,
      articleTitle: item.articleTitle,
      paragraphStart: item.paragraphStart,
      paragraphEnd: item.paragraphEnd,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  function normalizeAnalysis(raw: string | null | undefined): string | null {
    const trimmed = raw?.trim();
    if (!trimmed) return null;
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      throw new Error("解析内容格式不合法");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("解析内容格式不合法");
    }
    return JSON.stringify(value);
  }

  function latestTodayEvent(
    favoriteId: number,
    today: string,
  ): MockReviewEvent | null {
    return state.reviewEvents.reduce<MockReviewEvent | null>((latest, event) => {
      if (event.favoriteId !== favoriteId || event.localDate !== today) return latest;
      return !latest || event.id > latest.id ? event : latest;
    }, null);
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

    async listWordFavorites(today: string) {
      if (!isValidLocalDate(today)) throw new Error("日期必须使用 YYYY-MM-DD 格式");
      return [...state.wordFavorites]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
        .map((favorite) => wordView(favorite, today));
    },

    async addWordFavorite(input: AddWordFavoriteInput) {
      const word = input.word.trim();
      const sentence = input.sentence.trim();
      if (!word) throw new Error("词语不能为空");
      if (!sentence) throw new Error("原句不能为空");
      if (!isValidLocalDate(input.today)) {
        throw new Error("收藏日期必须使用 YYYY-MM-DD 格式");
      }
      if (input.paragraphStart < 0 || input.paragraphEnd < input.paragraphStart) {
        throw new Error("段落范围不合法");
      }
      const article = articleById(input.articleId);
      const normalizedWord = normalizeCollectionKey(word);
      const normalizedSentence = normalizeCollectionKey(sentence);
      const existing = state.wordFavorites.find(
        (favorite) =>
          favorite.normalizedWord === normalizedWord &&
          favorite.normalizedSentence === normalizedSentence,
      );
      if (existing) {
        const favorite = wordView(existing, input.today);
        return { created: false, favorite } satisfies FavoriteAddResult<WordFavorite>;
      }
      const favorite: MockWordFavorite = {
        id: state.nextWordFavoriteId++,
        word,
        normalizedWord,
        sentence,
        normalizedSentence,
        articleId: article.id,
        articleTitle: article.title,
        paragraphStart: input.paragraphStart,
        paragraphEnd: input.paragraphEnd,
        contextualMeaning: input.contextualMeaning.trim(),
        commonMeaning: input.commonMeaning.trim(),
        phonetic: input.phonetic?.trim() || null,
        partOfSpeech: input.partOfSpeech?.trim() || null,
        forms: input.forms ?? [],
        createdAt: new Date().toISOString(),
      };
      state.wordFavorites.push(favorite);
      state.schedules.push({
        favoriteId: favorite.id,
        ...initialSchedule(input.today),
        lastReviewedOn: null,
      });
      persist();
      const view = wordView(favorite, input.today);
      return { created: true, favorite: view } satisfies FavoriteAddResult<WordFavorite>;
    },

    async removeWordFavorite(id: number) {
      const before = state.wordFavorites.length;
      state.wordFavorites = state.wordFavorites.filter(
        (favorite) => favorite.id !== id,
      );
      state.schedules = state.schedules.filter(
        (schedule) => schedule.favoriteId !== id,
      );
      state.reviewEvents = state.reviewEvents.filter(
        (event) => event.favoriteId !== id,
      );
      persist();
      return state.wordFavorites.length < before;
    },

    async listLongSentenceFavorites() {
      return [...state.longSentences]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
        .map(longSentenceView);
    },

    async addLongSentenceFavorite(input: AddLongSentenceInput) {
      const sourceText = input.sourceText.trim();
      if (!sourceText) throw new Error("原文不能为空");
      if (input.paragraphStart < 0 || input.paragraphEnd < input.paragraphStart) {
        throw new Error("段落范围不合法");
      }
      const article = articleById(input.articleId);
      const normalized = normalizeCollectionKey(sourceText);
      const sourceKey = `${input.articleId}:${input.paragraphStart}:${input.paragraphEnd}:${normalized}`;
      const existing = state.longSentences.find(
        (item) => item.sourceKey === sourceKey,
      );
      if (existing) {
        const favorite = longSentenceView(existing);
        return {
          created: false,
          favorite,
        } satisfies FavoriteAddResult<LongSentenceFavorite>;
      }
      const now = new Date().toISOString();
      const item: MockLongSentence = {
        id: state.nextLongSentenceId++,
        sourceText,
        sourceKey,
        translation: input.translation?.trim() || null,
        analysis: normalizeAnalysis(input.analysis),
        articleId: article.id,
        articleTitle: article.title,
        paragraphStart: input.paragraphStart,
        paragraphEnd: input.paragraphEnd,
        createdAt: now,
        updatedAt: now,
      };
      state.longSentences.push(item);
      persist();
      return {
        created: true,
        favorite: longSentenceView(item),
      } satisfies FavoriteAddResult<LongSentenceFavorite>;
    },

    async fillLongSentenceFavorite(input: FillLongSentenceInput) {
      const item = state.longSentences.find((row) => row.id === input.id);
      if (!item) throw new Error("找不到这条长难句收藏");
      const translation = item.translation ?? (input.translation?.trim() || null);
      const analysis = item.analysis ??
        (input.analysis ? normalizeAnalysis(input.analysis) : null);
      if (!translation && !analysis) throw new Error("没有可补全的译文或解析");
      item.translation = translation;
      item.analysis = analysis;
      item.updatedAt = new Date().toISOString();
      persist();
      return longSentenceView(item);
    },

    async removeLongSentenceFavorite(id: number) {
      const before = state.longSentences.length;
      state.longSentences = state.longSentences.filter((item) => item.id !== id);
      persist();
      return state.longSentences.length < before;
    },

    async listDueWordFavorites(today: string) {
      if (!isValidLocalDate(today)) throw new Error("日期必须使用 YYYY-MM-DD 格式");
      const scheduleOf = (favoriteId: number) =>
        state.schedules.find((schedule) => schedule.favoriteId === favoriteId);
      const due = state.wordFavorites.filter((favorite) => {
        const schedule = scheduleOf(favorite.id);
        if (!schedule) return false;
        if (schedule.dueDate <= today) return true;
        return latestTodayEvent(favorite.id, today)?.rating === "forgotten";
      });
      due.sort((a, b) => {
        const dueA = scheduleOf(a.id)?.dueDate ?? "";
        const dueB = scheduleOf(b.id)?.dueDate ?? "";
        return (
          dueA.localeCompare(dueB) ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.id - b.id
        );
      });
      return due.map((favorite) => wordView(favorite, today));
    },

    async recordReviewEvent(input: ReviewEventInput) {
      if (input.rating !== "remembered" && input.rating !== "forgotten") {
        throw new Error("评分只能是记得或忘记");
      }
      if (!input.roundId.trim() || !input.revealId.trim()) {
        throw new Error("缺少本轮或揭晓标识");
      }
      if (!isValidLocalDate(input.localDate)) {
        throw new Error("复习日期必须使用 YYYY-MM-DD 格式");
      }
      const scheduleOf = (favoriteId: number) =>
        state.schedules.find((schedule) => schedule.favoriteId === favoriteId);
      const duplicate = state.reviewEvents.find(
        (event) => event.revealId === input.revealId,
      );
      if (duplicate) {
        const schedule = scheduleOf(duplicate.favoriteId);
        if (!schedule) throw new Error("找不到这张词卡的排程");
        return {
          favoriteId: duplicate.favoriteId,
          rating: duplicate.rating,
          stage: schedule.stage,
          dueDate: schedule.dueDate,
          recorded: false,
        } satisfies ReviewEventResult;
      }
      if (!state.wordFavorites.some((favorite) => favorite.id === input.favoriteId)) {
        throw new Error("找不到这条词语收藏");
      }
      const schedule = scheduleOf(input.favoriteId);
      if (!schedule) throw new Error("找不到这张词卡的排程");
      state.reviewEvents.push({
        id: state.nextReviewEventId++,
        favoriteId: input.favoriteId,
        roundId: input.roundId.trim(),
        revealId: input.revealId.trim(),
        rating: input.rating,
        localDate: input.localDate,
        createdAt: new Date().toISOString(),
      });
      const forgottenToday = state.reviewEvents.some(
        (event) =>
          event.favoriteId === input.favoriteId &&
          event.rating === "forgotten" &&
          event.localDate === input.localDate,
      );
      const next = nextSchedule({
        stage: schedule.stage,
        rating: input.rating,
        forgottenToday,
        today: input.localDate,
      });
      schedule.stage = next.stage;
      schedule.dueDate = next.dueDate;
      schedule.lastReviewedOn = input.localDate;
      persist();
      return {
        favoriteId: input.favoriteId,
        rating: input.rating,
        stage: next.stage,
        dueDate: next.dueDate,
        recorded: true,
      } satisfies ReviewEventResult;
    },

    async exportWordFavorites() {
      const words = await this.listWordFavorites(localDateKey());
      return wordFavoritesCsv(words);
    },

    async backupDatabase(destination: string) {
      const trimmed = destination.trim();
      if (!trimmed) throw new Error("备份路径不能为空");
      storage.setItem(`yuejian.browser.backup.${trimmed}`, JSON.stringify(state));
      return trimmed;
    },

    async deleteAllData() {
      state = {
        ...defaultState(),
        sections: [],
        wordlists: [],
      };
      persist();
    },

    async listWordlists(): Promise<WordlistSummary[]> {
      return state.wordlists.map(({ words, createdAt: _createdAt, ...list }) => ({
        ...list,
        wordCount: words.length,
      }));
    },

    async listWords(listIds?: string[]): Promise<WordlistWords[]> {
      if (listIds?.length === 0) return [];
      const selected = listIds ? new Set(listIds) : null;
      return state.wordlists
        .filter((list) => list.enabled)
        .filter((list) => !selected || selected.has(list.id))
        .map((list) => ({ id: list.id, name: list.name, words: [...list.words] }));
    },

    async importWordlist(input: ImportWordlistInput): Promise<WordlistSummary> {
      const name = input.name.trim();
      if (!name) throw new Error("词表名称不能为空");
      if ([...name].length > 60) throw new Error("词表名称不能超过 60 个字符");
      const words = parseWordlist(input.content);
      const list: MockWordlist = {
        id: `custom-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
        name,
        source: input.source.trim() || "本地文件",
        enabled: true,
        builtIn: false,
        createdAt: new Date().toISOString(),
        words,
      };
      state.wordlists.push(list);
      persist();
      return {
        id: list.id,
        name: list.name,
        source: list.source,
        enabled: list.enabled,
        builtIn: list.builtIn,
        wordCount: list.words.length,
      };
    },

    async deleteWordlist(id: string) {
      const before = state.wordlists.length;
      state.wordlists = state.wordlists.filter((list) => list.id !== id);
      persist();
      return state.wordlists.length < before;
    },

    async listEssaySummaries() {
      return [...state.essayDocuments]
        .sort((a, b) => a.sequenceNo - b.sequenceNo)
        .map(essaySummaryView);
    },

    async getEssayDocument(id: number) {
      return essayDocumentView(essayDocumentById(id));
    },

    async listEssayDocuments() {
      return [...state.essayDocuments]
        .sort((a, b) => a.sequenceNo - b.sequenceNo)
        .map(essayDocumentView);
    },

    async createEssayDocument(input: CreateEssayDocumentInput) {
      const now = new Date().toISOString();
      const document: EssayDocument = {
        id: state.nextEssayDocumentId++,
        sequenceNo: state.essayDocuments.reduce((max, item) => Math.max(max, item.sequenceNo), 0) + 1,
        name: input.name?.trim() ? validEssayName(input.name) : "未命名作文",
        text: validEssayText(input.text),
        revisions: [],
        createdAt: now,
        updatedAt: now,
      };
      state.essayDocuments.push(document);
      persist();
      return essayDocumentView(document);
    },

    async renameEssayDocument(id: number, name: string) {
      const document = essayDocumentById(id);
      document.name = validEssayName(name);
      document.updatedAt = new Date().toISOString();
      persist();
      return essayDocumentView(document);
    },

    async updateEssayText(id: number, text: string) {
      const document = essayDocumentById(id);
      document.text = validEssayText(text);
      document.updatedAt = new Date().toISOString();
      persist();
      return essayDocumentView(document);
    },

    async deleteEssayDocument(id: number) {
      const before = state.essayDocuments.length;
      state.essayDocuments = state.essayDocuments.filter((document) => document.id !== id);
      persist();
      return state.essayDocuments.length < before;
    },

    async addEssayRevision(input: AddEssayRevisionInput) {
      const document = essayDocumentById(input.documentId);
      const text = validEssayText(input.text);
      const revision = {
        id: state.nextEssayRevisionId++,
        documentId: document.id,
        revisionNo: document.revisions.reduce((max, item) => Math.max(max, item.revisionNo), 0) + 1,
        text,
        result: {
          ...input.result,
          issues: input.result.issues.map((issue) => ({ ...issue })),
        },
        createdAt: new Date().toISOString(),
      };
      document.revisions.push(revision);
      document.text = text;
      document.updatedAt = revision.createdAt;
      persist();
      return {
        ...revision,
        result: {
          ...revision.result,
          issues: revision.result.issues.map((issue) => ({ ...issue })),
        },
      };
    },

    async deleteEssayRevision(id: number) {
      for (const document of state.essayDocuments) {
        const before = document.revisions.length;
        document.revisions = document.revisions.filter((revision) => revision.id !== id);
        if (document.revisions.length < before) {
          persist();
          return true;
        }
      }
      return false;
    },
  };
}