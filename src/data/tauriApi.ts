import { invoke } from "@tauri-apps/api/core";
import type {
  AddResult,
  ArticleDetail,
  ArticleSummary,
  ImportSuiteInput,
  ImportSuiteResult,
  LibraryGroup,
  ReaderApi,
  Section,
  UpdateArticleInput,
} from "./types";

/** 桌面端实现：全部读写经 Rust 命令进入 SQLite。 */
export const tauriApi: ReaderApi = {
  listSections: () => invoke<Section[]>("list_sections"),
  createSection: (name) => invoke<Section>("create_section", { name }),
  renameSection: (id, name) => invoke<Section>("rename_section", { id, name }),
  listSectionArticles: (sectionId) =>
    invoke<ArticleSummary[]>("list_section_articles", { sectionId }),
  listLibrary: (search) => invoke<LibraryGroup[]>("list_library", { search: search ?? null }),
  getArticle: (id) => invoke<ArticleDetail>("get_article", { id }),
  pasteArticle: (input) => invoke<ArticleDetail>("paste_article", { input }),
  importSuite: (input: ImportSuiteInput) => invoke<ImportSuiteResult>("import_suite", { input }),
  updateArticle: (input: UpdateArticleInput) =>
    invoke<ArticleDetail>("update_article", { input }),
  addArticlesToSection: (sectionId, articleIds) =>
    invoke<AddResult>("add_articles_to_section", { sectionId, articleIds }),
  removeArticleFromSection: (sectionId, articleId) =>
    invoke<boolean>("remove_article_from_section", { sectionId, articleId }),
  getArticleSections: (articleId) =>
    invoke<Section[]>("get_article_sections", { articleId }),
};