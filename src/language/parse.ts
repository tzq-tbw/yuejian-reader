/**
 * 模型响应解析。模型输出可能带代码围栏、前后说明或宽松 JSON，
 * 这里统一收敛为侧栏可以直接渲染的结构。
 */

import type {
  AnalysisClause,
  Collocation,
} from "./types";

export interface ParsedWordCard {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  contextualMeaning: string;
  commonMeaning: string;
  forms: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => toText(item))
      .filter(Boolean)
      .join("；");
  }
  return "";
}

function pickString(
  record: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const text = toText(record[key]);
    if (text) return text;
  }
  return "";
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[;；\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const record = asRecord(item);
      if (!record) return "";
      const text = pickString(record, ["text", "value", "item", "explanation", "description"]);
      const label = pickString(record, ["label", "name", "type"]);
      if (label && text) return `${label}：${text}`;
      return text || label;
    })
    .filter(Boolean);
}

/** 去掉 ```json ... ``` 围栏；允许围栏语言标记紧贴内容。 */
export function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9_-]*\s*([\s\S]*?)\s*```$/);
  return (match ? match[1] : trimmed).trim();
}

function parseJsonObject(content: string): Record<string, unknown> {
  const body = stripCodeFence(content);
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("模型返回的 JSON 无法解析");
  }
  const source = body
    .slice(start, end + 1)
    // 容忍非严格 JSON 中常见的尾逗号。
    .replace(/,\s*([}\]])/g, "$1");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("模型返回的 JSON 无法解析");
  }
  const record = asRecord(parsed);
  if (!record) throw new Error("模型返回的 JSON 不是对象");
  return record;
}

function labelValue(content: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = content.match(
      new RegExp(`(?:^|\\n)\\s*${escaped}\\s*[：:]\\s*([^\\n]+)`, "i"),
    );
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

/**
 * OpenAI 兼容响应 → 文本内容。
 * 兼容字符串 content、分段 content 数组以及纯文本 completion。
 */
export function extractChatContent(raw: unknown): string {
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) throw new Error("模型没有返回内容");
    return text;
  }
  const record = asRecord(raw);
  if (!record) throw new Error("模型返回格式不受支持");

  const apiError = asRecord(record.error);
  if (apiError) {
    const message = pickString(apiError, ["message", "detail", "type"]);
    throw new Error(`模型服务错误：${message || "未知错误"}`);
  }

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const choice = asRecord(choices[0]);
    if (choice?.finish_reason === "length") {
      throw new Error("模型输出被截断，请缩小选区或重试");
    }
    const message = asRecord(choice?.message);
    const content = message?.content ?? choice?.text;
    if (typeof content === "string" && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const text = content
        .map((part) => {
          if (typeof part === "string") return part;
          const item = asRecord(part);
          if (!item) return "";
          return typeof item.text === "string" ? item.text : toText(item.text);
        })
        .join("")
        .trim();
      if (text) return text;
    }
  }
  throw new Error("模型没有返回内容");
}

function formToString(item: unknown): string {
  if (typeof item === "string") return item.trim();
  const record = asRecord(item);
  if (!record) return "";
  const label = pickString(record, ["label", "name", "type", "form"]);
  const value = pickString(record, ["value", "text", "word", "form"]);
  if (label && value) return `${label}：${value}`;
  return value || label;
}

function normalizeForms(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[;；\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.map(formToString).filter(Boolean);
  }
  const record = asRecord(value);
  if (!record) return [];
  return Object.entries(record)
    .map(([label, item]) => {
      const text = toText(item);
      return text ? `${label}：${text}` : "";
    })
    .filter(Boolean);
}

/**
 * 解析词卡。优先 JSON；若模型改用了“语境义：…”这种行式输出，
 * 再用标签兜底，保证一次失败不会把整个结果丢掉。
 */
export function parseWordCardResponse(
  content: string,
  fallback: { word: string; sentence: string },
): ParsedWordCard {
  let record: Record<string, unknown> | null = null;
  try {
    record = parseJsonObject(content);
  } catch {
    record = null;
  }

  if (record) {
    const contextual = pickString(record, [
      "contextualMeaning",
      "contextMeaning",
      "meaningInContext",
      "contextual",
    ]);
    const common = pickString(record, [
      "commonMeaning",
      "commonMeanings",
      "usualMeaning",
      "common",
    ]);
    if (contextual || common) {
      return {
        word: pickString(record, ["word", "lemma", "term"]) || fallback.word,
        phonetic: pickString(record, ["phonetic", "ipa", "pronunciation"]),
        partOfSpeech: pickString(record, ["partOfSpeech", "pos"]),
        contextualMeaning: contextual || common,
        commonMeaning: common || contextual,
        forms: normalizeForms(record.forms ?? record.wordForms ?? record.form),
      };
    }
  }

  const contextual = labelValue(content, [
    "语境义",
    "语境释义",
    "contextual meaning",
  ]);
  const common = labelValue(content, ["常见义", "常见释义", "common meaning"]);
  if (!contextual && !common) {
    throw new Error("模型没有给出可用的词义");
  }
  return {
    word: fallback.word,
    phonetic: labelValue(content, ["音标", "phonetic"]),
    partOfSpeech: labelValue(content, ["词性", "part of speech"]),
    contextualMeaning: contextual || common,
    commonMeaning: common || contextual,
    forms: normalizeForms(labelValue(content, ["词形", "forms"])),
  };
}

export function parseTranslationResponse(content: string): string {
  let text = stripCodeFence(content).trim();
  text = text.replace(/^(?:译文|翻译)\s*[：:]\s*/, "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("“") && text.endsWith("”"))
  ) {
    const inner = text.slice(1, -1).trim();
    if (inner) text = inner;
  }
  if (!text) throw new Error("模型没有返回译文");
  return text;
}

function toClauses(value: unknown): AnalysisClause[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") {
        return { text: item.trim(), explanation: "" };
      }
      const record = asRecord(item);
      if (!record) return { text: "", explanation: "" };
      return {
        text: pickString(record, ["text", "clause", "source"]),
        explanation: pickString(record, [
          "explanation",
          "meaning",
          "role",
          "function",
          "note",
        ]),
      };
    })
    .filter((item) => item.text || item.explanation);
}

function toCollocations(value: unknown): Collocation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") {
        return { phrase: item.trim(), meaning: "" };
      }
      const record = asRecord(item);
      if (!record) return { phrase: "", meaning: "" };
      return {
        phrase: pickString(record, ["phrase", "text", "collocation", "expression"]),
        meaning: pickString(record, ["meaning", "translation", "explanation"]),
      };
    })
    .filter((item) => item.phrase || item.meaning);
}

export function parseAnalysisResponse(
  content: string,
  source: string,
): Omit<import("./types").AnalysisResult, "kind" | "target"> {
  const record = parseJsonObject(content);
  const trunk = pickString(record, [
    "trunk",
    "mainClause",
    "mainStructure",
    "skeleton",
  ]);
  const clauses = toClauses(record.clauses ?? record.clause);
  const modifiers = toStringArray(record.modifiers ?? record.modifier);
  const collocations = toCollocations(
    record.collocations ?? record.collocation ?? record.phrases,
  );
  if (!trunk && !clauses.length && !modifiers.length && !collocations.length) {
    throw new Error("模型没有识别到可展示的句法成分");
  }
  return { source, trunk, clauses, modifiers, collocations };
}