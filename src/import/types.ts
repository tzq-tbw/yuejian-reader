/** PDF 提取与拆篇的中间结构。坐标使用 PDF 用户空间（原点左下，y 向上）。 */

export interface RawTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
  hasEOL?: boolean;
}

export interface TextRun {
  text: string;
  x: number;
  width: number;
  height: number;
}

export interface TextLine {
  page: number;
  /** 行基线 y；同一页内按 y 从大到小即从上到下。 */
  y: number;
  /** 行内最靠左的非空白文本 x。 */
  x: number;
  text: string;
  runs: TextRun[];
}

export interface ExtractedPage {
  pageNumber: number;
  width: number;
  height: number;
  lines: TextLine[];
}

export interface ExtractedDocument {
  pageCount: number;
  pages: ExtractedPage[];
}

export interface RawPage {
  pageNumber: number;
  width: number;
  height: number;
  items: RawTextItem[];
}

export interface WordBankEntry {
  letter: string;
  word: string;
}

export interface ImportedQuestionOption {
  letter: string;
  text: string;
}

export interface ImportedQuestion {
  number: number;
  stem: string;
  options: ImportedQuestionOption[];
}

export interface ImportedStatement {
  number: number;
  text: string;
}

/**
 * 随篇题目区。正文只保存阅读材料，题号、词库、陈述句和选项保存在这里。
 * raw 用于题型无法识别时保留原文。
 */
export type QuestionArea =
  | { kind: "banked_cloze"; blanks: number[]; wordBank: WordBankEntry[] }
  | { kind: "matching"; statements: ImportedStatement[]; paragraphLetters: string[] }
  | { kind: "multiple_choice"; questions: ImportedQuestion[] }
  | { kind: "raw" };

export interface CandidateArticle {
  title: string;
  examType: string;
  sequenceNo: number;
  pageRange: string;
  questionRange: string;
  paragraphs: string[];
  questionArea: QuestionArea;
  warnings: string[];
}

export interface ReadingAnalysis {
  articles: CandidateArticle[];
  warnings: string[];
}