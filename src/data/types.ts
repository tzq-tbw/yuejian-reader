/** 与 src-tauri 中的命令返回值一一对应。字段名使用 camelCase。 */

import type {
  AddEssayRevisionInput,
  CreateEssayDocumentInput,
  EssayDocument,
  EssayDocumentSummary,
  EssayRevision,
} from "../essay/types";

export interface Section {
  id: string;
  name: string;
  sortOrder: number;
  articleCount: number;
  createdAt: string;
}

export interface ArticleSummary {
  id: number;
  title: string;
  topic: string;
  version: number;
  paragraphCount: number;
  wordCount: number;
  suiteId: string | null;
  suiteTitle: string | null;
  examType: string | null;
  sequenceNo: number | null;
  pageRange: string | null;
  questionRange: string | null;
  sectionCount: number;
  updatedAt: string;
}

export interface ArticleDetail extends ArticleSummary {
  paragraphs: string[];
  source: string;
  createdAt: string;
  sectionIds: string[];
  /** 随篇题目区的 JSON（结构化内容由 src/import 定义）。 */
  questionArea: string | null;
}

export interface LibraryGroup {
  suiteId: string | null;
  title: string;
  source: string;
  articles: ArticleSummary[];
}

export interface AddResult {
  added: number;
}

// ---------------------------------------------------------------------------
// 收藏与复习（字段与 src-tauri/src/db.rs 对应）
// ---------------------------------------------------------------------------

export interface WordFavorite {
  id: number;
  /** 收藏时展示的词形（模型可能给出原形）。 */
  word: string;
  normalizedWord: string;
  /** 原句快照，文章后续编辑不覆盖。 */
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
  stage: number | null;
  dueDate: string | null;
  /** 历史上忘记的总次数，供 AI 重点词与人工回顾使用。 */
  forgottenCount: number;
  forgottenToday: boolean;
}

export interface LongSentenceFavorite {
  id: number;
  sourceText: string;
  translation: string | null;
  /** 结构化解析的 JSON 字符串；缺失时为空。 */
  analysis: string | null;
  articleId: number | null;
  articleTitle: string;
  paragraphStart: number;
  paragraphEnd: number;
  createdAt: string;
  updatedAt: string;
}

export interface FavoriteAddResult<T> {
  created: boolean;
  favorite: T;
}

export interface AddWordFavoriteInput {
  word: string;
  sentence: string;
  articleId: number;
  paragraphStart: number;
  paragraphEnd: number;
  contextualMeaning: string;
  commonMeaning: string;
  phonetic?: string | null;
  partOfSpeech?: string | null;
  forms?: string[];
  /** 本机日历日；后端按次日建立首次复习。 */
  today: string;
}

export interface AddLongSentenceInput {
  sourceText: string;
  translation?: string | null;
  analysis?: string | null;
  articleId: number;
  paragraphStart: number;
  paragraphEnd: number;
}

export interface FillLongSentenceInput {
  id: number;
  translation?: string | null;
  analysis?: string | null;
}

export type ReviewRating = "remembered" | "forgotten";

export interface ReviewEventInput {
  favoriteId: number;
  roundId: string;
  /** 同一次揭晓重复提交时保持不变，数据库只记录一次。 */
  revealId: string;
  rating: ReviewRating;
  localDate: string;
}

export interface ReviewEventResult {
  favoriteId: number;
  rating: ReviewRating;
  stage: number;
  dueDate: string;
  recorded: boolean;
}

export interface UpdateArticleInput {
  id: number;
  title: string;
  topic: string;
  paragraphs: string[];
  expectedVersion: number;
}

export interface ImportArticleInput {
  title: string;
  examType: string;
  sequenceNo: number;
  pageRange?: string | null;
  questionRange?: string | null;
  questionArea?: string | null;
  paragraphs: string[];
}

export interface ImportSuiteInput {
  title: string;
  /** 试卷文件内容的 SHA-256；同一文件重复导入时不重复建卡。 */
  fingerprint: string;
  examLevel?: string | null;
  articles: ImportArticleInput[];
}

export interface ImportSuiteResult {
  suiteId: string;
  title: string;
  /** false 表示这套试卷此前已导入，articles 为已有卡片。 */
  created: boolean;
  articles: ArticleSummary[];
}

export interface WordlistSummary {
  id: string;
  name: string;
  source: string;
  enabled: boolean;
  builtIn: boolean;
  wordCount: number;
}

export interface WordlistWords {
  id: string;
  name: string;
  words: string[];
}

export interface ImportWordlistInput {
  name: string;
  source: string;
  content: string;
}

export interface ReaderApi {
  listSections(): Promise<Section[]>;
  createSection(name: string): Promise<Section>;
  renameSection(id: string, name: string): Promise<Section>;
  listSectionArticles(sectionId: string): Promise<ArticleSummary[]>;
  listLibrary(search?: string): Promise<LibraryGroup[]>;
  getArticle(id: number): Promise<ArticleDetail>;
  /** topic 省略或为空时由后端按正文自动分类。 */
  pasteArticle(input: { title: string; text: string; topic?: string }): Promise<ArticleDetail>;
  importSuite(input: ImportSuiteInput): Promise<ImportSuiteResult>;
  updateArticle(input: UpdateArticleInput): Promise<ArticleDetail>;
  addArticlesToSection(sectionId: string, articleIds: number[]): Promise<AddResult>;
  removeArticleFromSection(sectionId: string, articleId: number): Promise<boolean>;
  getArticleSections(articleId: number): Promise<Section[]>;

  listWordFavorites(today: string): Promise<WordFavorite[]>;
  addWordFavorite(input: AddWordFavoriteInput): Promise<FavoriteAddResult<WordFavorite>>;
  removeWordFavorite(id: number): Promise<boolean>;
  listLongSentenceFavorites(): Promise<LongSentenceFavorite[]>;
  addLongSentenceFavorite(
    input: AddLongSentenceInput,
  ): Promise<FavoriteAddResult<LongSentenceFavorite>>;
  fillLongSentenceFavorite(input: FillLongSentenceInput): Promise<LongSentenceFavorite>;
  removeLongSentenceFavorite(id: number): Promise<boolean>;
  listDueWordFavorites(today: string): Promise<WordFavorite[]>;
  recordReviewEvent(input: ReviewEventInput): Promise<ReviewEventResult>;

  exportWordFavorites(): Promise<string>;
  backupDatabase(destination: string): Promise<string>;
  deleteAllData(): Promise<void>;
  listWordlists(): Promise<WordlistSummary[]>;
  listWords(listIds?: string[]): Promise<WordlistWords[]>;
  importWordlist(input: ImportWordlistInput): Promise<WordlistSummary>;
  deleteWordlist(id: string): Promise<boolean>;

  listEssaySummaries(): Promise<EssayDocumentSummary[]>;
  getEssayDocument(id: number): Promise<EssayDocument>;
  listEssayDocuments(): Promise<EssayDocument[]>;
  createEssayDocument(input: CreateEssayDocumentInput): Promise<EssayDocument>;
  renameEssayDocument(id: number, name: string): Promise<EssayDocument>;
  updateEssayText(id: number, text: string): Promise<EssayDocument>;
  deleteEssayDocument(id: number): Promise<boolean>;
  addEssayRevision(input: AddEssayRevisionInput): Promise<EssayRevision>;
  deleteEssayRevision(id: number): Promise<boolean>;
}

export const UNCATEGORIZED = "未分类";

export const TOPIC_SUGGESTIONS = [
  "城市与生活",
  "教育与学习",
  "科技与创新",
  "健康与环境",
  "工作与经济",
  "科学与自然",
  "社会与文化",
  UNCATEGORIZED,
] as const;