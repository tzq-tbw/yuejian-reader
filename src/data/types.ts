/** 与 src-tauri 中的命令返回值一一对应。字段名使用 camelCase。 */

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
  sectionCount: number;
  updatedAt: string;
}

export interface ArticleDetail extends ArticleSummary {
  paragraphs: string[];
  source: string;
  createdAt: string;
  sectionIds: string[];
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

export interface UpdateArticleInput {
  id: number;
  title: string;
  topic: string;
  paragraphs: string[];
  expectedVersion: number;
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
  updateArticle(input: UpdateArticleInput): Promise<ArticleDetail>;
  addArticlesToSection(sectionId: string, articleIds: number[]): Promise<AddResult>;
  removeArticleFromSection(sectionId: string, articleId: number): Promise<boolean>;
  getArticleSections(articleId: number): Promise<Section[]>;
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