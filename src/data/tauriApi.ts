import { invoke } from "@tauri-apps/api/core";
import type {
  AddLongSentenceInput,
  AddResult,
  AddWordFavoriteInput,
  ArticleDetail,
  ArticleSummary,
  FavoriteAddResult,
  FillLongSentenceInput,
  ImportSuiteInput,
  ImportSuiteResult,
  LibraryGroup,
  LongSentenceFavorite,
  ReaderApi,
  ReviewEventInput,
  ReviewEventResult,
  Section,
  UpdateArticleInput,
  WordFavorite,
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

  listWordFavorites: (today) =>
    invoke<WordFavorite[]>("list_word_favorites", { today }),
  addWordFavorite: (input: AddWordFavoriteInput) =>
    invoke<FavoriteAddResult<WordFavorite>>("add_word_favorite", { input }),
  removeWordFavorite: (id) => invoke<boolean>("remove_word_favorite", { id }),
  listLongSentenceFavorites: () =>
    invoke<LongSentenceFavorite[]>("list_long_sentence_favorites"),
  addLongSentenceFavorite: (input: AddLongSentenceInput) =>
    invoke<FavoriteAddResult<LongSentenceFavorite>>("add_long_sentence_favorite", {
      input,
    }),
  fillLongSentenceFavorite: (input: FillLongSentenceInput) =>
    invoke<LongSentenceFavorite>("fill_long_sentence_favorite", { input }),
  removeLongSentenceFavorite: (id) =>
    invoke<boolean>("remove_long_sentence_favorite", { id }),
  listDueWordFavorites: (today) =>
    invoke<WordFavorite[]>("list_due_word_favorites", { today }),
  recordReviewEvent: (input: ReviewEventInput) =>
    invoke<ReviewEventResult>("record_review_event", { input }),
};