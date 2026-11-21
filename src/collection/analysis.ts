import type {
  AnalysisClause,
  AnalysisResult,
  Collocation,
} from "../language/types";

/** 长难句本保存的解析内容，不含当次请求的文章版本与选区目标。 */
export interface AnalysisContent {
  trunk: string;
  clauses: AnalysisClause[];
  modifiers: string[];
  collocations: Collocation[];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clauses(value: unknown): AnalysisClause[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      text: stringValue(item.text),
      explanation: stringValue(item.explanation),
    }))
    .filter((item) => item.text || item.explanation);
}

function collocations(value: unknown): Collocation[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      phrase: stringValue(item.phrase),
      meaning: stringValue(item.meaning),
    }))
    .filter((item) => item.phrase || item.meaning);
}

function modifiers(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function toAnalysisContent(
  result: AnalysisResult | AnalysisContent,
): AnalysisContent {
  return {
    trunk: result.trunk,
    clauses: result.clauses,
    modifiers: result.modifiers,
    collocations: result.collocations,
  };
}

export function packAnalysis(result: AnalysisResult | AnalysisContent): string {
  return JSON.stringify(toAnalysisContent(result));
}

/** 容错解析历史快照；损坏或不是对象时返回 null，不阻断复习。 */
export function parseStoredAnalysis(
  raw: string | null | undefined,
): AnalysisContent | null {
  if (!raw || !raw.trim()) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    return {
      trunk: stringValue(record.trunk),
      clauses: clauses(record.clauses),
      modifiers: modifiers(record.modifiers),
      collocations: collocations(record.collocations),
    };
  } catch {
    return null;
  }
}

export function hasAnalysisContent(
  content: AnalysisContent | null,
): content is AnalysisContent {
  if (!content) return false;
  return Boolean(
    content.trunk ||
      content.clauses.length ||
      content.modifiers.length ||
      content.collocations.length,
  );
}