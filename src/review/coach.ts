import type { WordFavorite } from "../data/types";
import type { ChatMessage, ChatTransport, ModelConfig } from "../language/types";
import { resolveModelConfig } from "../language/config";
import { createDefaultTransport } from "../language/transport";
import { extractChatContent } from "../language/parse";

export interface ReviewFocusWord {
  word: string;
  reason: string;
}

export interface ReviewCoach {
  suggestFocus(cards: WordFavorite[]): Promise<ReviewFocusWord[]>;
}

export function buildFocusWordsMessages(cards: WordFavorite[]): ChatMessage[] {
  const lines = cards.map(
    (card) =>
      `- ${card.word}｜到期：${card.dueDate ?? "未排程"}｜历史忘记：${
        card.forgottenCount
      } 次｜语境义：${card.contextualMeaning || "无"}`,
  );
  return [
    {
      role: "system",
      content: [
        "你是英语复习助手，面向中国大学英语四级读者。",
        "从用户给出的到期词卡中挑出 1–5 个近期最容易忘记的词，并说明简短理由。",
        "只能选择列表中已有的词，不要编造新词。",
        "优先参考历史忘记次数、逾期时长和语境难度。",
        "只输出一个 JSON 对象，不要 Markdown 或额外说明。",
        '格式：{"words":[{"word":"列表中出现的词","reason":"简短中文理由"}]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [`今日到期词卡（共 ${cards.length} 张）：`, ...lines].join("\n"),
    },
  ];
}

function listFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.words)) return record.words;
  }
  return [];
}

/** 过滤模型编造的词、去重并保留最多 5 条。 */
export function parseFocusWordsResponse(
  content: string,
  cards: WordFavorite[],
): ReviewFocusWord[] {
  const allowed = new Map(
    cards.map((card) => [card.word.trim().toLowerCase(), card.word]),
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      content
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    );
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const result: ReviewFocusWord[] = [];
  for (const item of listFrom(parsed)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const rawWord = typeof record.word === "string" ? record.word.trim() : "";
    const key = rawWord.toLowerCase();
    const display = allowed.get(key);
    if (!display || seen.has(key)) continue;
    seen.add(key);
    result.push({
      word: display,
      reason:
        typeof record.reason === "string" ? record.reason.trim() : "",
    });
    if (result.length >= 5) break;
  }
  return result;
}

export function createReviewCoach(
  options: { transport?: ChatTransport; config?: Partial<ModelConfig> } = {},
): ReviewCoach {
  const config = resolveModelConfig(options.config);
  const transport = options.transport ?? createDefaultTransport(config);
  return {
    async suggestFocus(cards: WordFavorite[]) {
      if (!cards.length) return [];
      const raw = await transport.chat({
        messages: buildFocusWordsMessages(cards),
        temperature: 0.2,
        maxTokens: 900,
      });
      return parseFocusWordsResponse(extractChatContent(raw), cards);
    },
  };
}