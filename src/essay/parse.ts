import { stripCodeFence } from "../language/parse";
import type { EssayIssue, EssayIssueCategory, EssayReview, EssaySeverity } from "./types";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function severity(value: unknown): EssaySeverity {
  const normalized = text(value).toLowerCase();
  if (["high", "严重", "高"].includes(normalized)) return "high";
  if (["low", "轻微", "低"].includes(normalized)) return "low";
  return "medium";
}

function category(value: unknown): EssayIssueCategory {
  const normalized = text(value).toLowerCase();
  if (["grammar", "语法"].includes(normalized)) return "grammar";
  if (["word", "vocabulary", "单词", "用词"].includes(normalized)) return "word";
  if (["spelling", "拼写"].includes(normalized)) return "spelling";
  if (["tense", "时态"].includes(normalized)) return "tense";
  if (["collocation", "搭配"].includes(normalized)) return "collocation";
  return "other";
}

export function parseEssayReview(content: string): EssayReview {
  const body = stripCodeFence(content);
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型返回的作文批改 JSON 无法解析");
  let value: unknown;
  try {
    value = JSON.parse(body.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1"));
  } catch {
    throw new Error("模型返回的作文批改 JSON 无法解析");
  }
  const root = record(value);
  if (!root) throw new Error("模型返回的作文批改结果不是对象");
  const rawIssues = root.issues ?? root.errors;
  const issues = (Array.isArray(rawIssues) ? rawIssues : [])
    .map((item): EssayIssue | null => {
      const issue = record(item);
      if (!issue) return null;
      const parsed = {
        severity: severity(issue.severity ?? issue.level),
        category: category(issue.category ?? issue.type),
        location: text(issue.location ?? issue.position) || "全文",
        original: text(issue.original ?? issue.source ?? issue.error),
        suggestion: text(issue.suggestion ?? issue.correction ?? issue.revised),
        explanation: text(issue.explanation ?? issue.reason ?? issue.note),
      };
      return parsed.original || parsed.suggestion || parsed.explanation ? parsed : null;
    })
    .filter((issue): issue is EssayIssue => issue !== null);
  const order: Record<EssaySeverity, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((left, right) =>
    order[left.severity] - order[right.severity] ||
    left.location.localeCompare(right.location, "zh-CN", { numeric: true }));
  const polished = text(root.polished ?? root.polishedEssay ?? root.polishedVersion ?? root.revisedEssay);
  if (!issues.length && !polished) throw new Error("模型没有返回可用的批改或润色内容");
  return { issues, polished };
}
