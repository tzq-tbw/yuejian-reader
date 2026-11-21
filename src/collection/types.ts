import type { AnalysisResult } from "../language/types";

export interface CollectWordInput {
  word: string;
  /** 原句快照；短语收藏时取短语所在的原句。 */
  sentence: string;
  contextualMeaning: string;
  commonMeaning: string;
  phonetic?: string | null;
  partOfSpeech?: string | null;
  forms?: string[];
  articleId: number;
  paragraphStart: number;
  paragraphEnd: number;
}

export interface CollectLongSentenceInput {
  sourceText: string;
  translation?: string | null;
  analysis?: AnalysisResult | null;
  articleId: number;
  paragraphStart: number;
  paragraphEnd: number;
  /** 显式收藏整段（如“收藏本段”、段落翻译）时即使只有一个句子也先确认。 */
  wholeParagraph?: boolean;
}

export type CollectOutcome = "created" | "existing" | "cancelled" | "error";