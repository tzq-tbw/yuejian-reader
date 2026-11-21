/**
 * 阶段 3 精读语言模块的类型。
 *
 * 模型结果只用于当前会话的侧栏展示，不写入 SQLite；收藏与持久化属于阶段 4。
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelConfig {
  /** OpenAI 兼容服务的根地址，例如 http://127.0.0.1:3425/v1。 */
  baseUrl: string;
  model: string;
  /** 占位配置：阶段 3 不实现系统凭据存储，默认空字符串。 */
  apiKey: string;
  temperature: number;
  timeoutMs: number;
}

export interface ChatCall {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * 网络传输层。桌面端经 Rust 命令发出，浏览器预览用 fetch；
 * 测试注入可控延迟桩，无需真实网络。
 */
export interface ChatTransport {
  chat(call: ChatCall): Promise<unknown>;
}

/** 正文中的一个位置：段落序号 + 段内字符偏移。 */
export interface TextAnchor {
  paragraph: number;
  offset: number;
}

export type ReadingOperation =
  | "word"
  | "translate"
  | "parse"
  | "paragraph"
  | "article";

/**
 * 每次语言请求都携带完整的核对信息。
 * 响应返回时用文章 ID、正文版本、选区起止和操作类别判断是否仍是当前目标。
 */
export interface ReadingTarget {
  articleId: number;
  version: number;
  operation: ReadingOperation;
  start: TextAnchor;
  end: TextAnchor;
  paragraphs: number[];
  text: string;
}

export interface SelectionInput {
  text: string;
  start: TextAnchor;
  end: TextAnchor;
  paragraphs: Array<{ index: number; text: string }>;
}

export interface WordRequestInput {
  target: ReadingTarget;
  word: string;
  sentence: string;
  /** 该词所在段落全文，用于语境义判断。 */
  paragraph: string;
  articleTitle: string;
}

export interface TextRequestInput {
  target: ReadingTarget;
  text: string;
  paragraphs: Array<{ index: number; text: string }>;
  articleTitle: string;
}

export interface WordCard {
  kind: "word";
  target: ReadingTarget;
  word: string;
  sentence: string;
  phonetic: string;
  partOfSpeech: string;
  contextualMeaning: string;
  commonMeaning: string;
  forms: string[];
}

export interface TranslationRow {
  paragraph: number;
  source: string;
  translation: string;
  error: string | null;
  /** 仅用于逐段重试期间的界面状态，不持久化。 */
  loading?: boolean;
}

export interface TranslationResult {
  kind: "translation";
  target: ReadingTarget;
  mode: "selection" | "paragraph" | "article";
  source: string;
  /** 选区/段落翻译正文；全文翻译的逐段结果放在 rows。 */
  translation: string;
  rows: TranslationRow[] | null;
  /** 同一选区翻译后再点“解析”时追加在同一结果下。 */
  analysis?: AnalysisResult | null;
}

export interface AnalysisClause {
  text: string;
  explanation: string;
}

export interface Collocation {
  phrase: string;
  meaning: string;
}

export interface AnalysisResult {
  kind: "analysis";
  target: ReadingTarget;
  source: string;
  trunk: string;
  clauses: AnalysisClause[];
  modifiers: string[];
  collocations: Collocation[];
}

export type AssistantResult = WordCard | TranslationResult | AnalysisResult;

export interface LanguageService {
  wordCard(input: WordRequestInput): Promise<WordCard>;
  translate(input: TextRequestInput): Promise<TranslationResult>;
  analyze(input: TextRequestInput): Promise<AnalysisResult>;
}