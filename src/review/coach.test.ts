import { describe, expect, it, vi } from "vitest";
import type { WordFavorite } from "../data/types";
import {
  buildFocusWordsMessages,
  createReviewCoach,
  parseFocusWordsResponse,
} from "./coach";

function card(word: string, forgottenCount = 0): WordFavorite {
  return {
    id: 1,
    word,
    normalizedWord: word.toLowerCase(),
    sentence: "A sentence.",
    normalizedSentence: "a sentence.",
    articleId: 1,
    articleTitle: "Source",
    paragraphStart: 0,
    paragraphEnd: 0,
    contextualMeaning: "某义",
    commonMeaning: "常见义",
    phonetic: null,
    partOfSpeech: null,
    forms: [],
    createdAt: "2026-11-21T00:00:00.000Z",
    stage: 1,
    dueDate: "2026-11-21",
    forgottenCount,
    forgottenToday: false,
  };
}

describe("AI 重点词", () => {
  it("提示词只发送到期词与历史表现摘要", () => {
    const messages = buildFocusWordsMessages([
      card("address", 3),
      card("meeting", 0),
    ]);
    expect(messages.map((message) => message.role)).toEqual([
      "system",
      "user",
    ]);
    expect(messages[1].content).toContain("address");
    expect(messages[1].content).toContain("历史忘记：3 次");
    expect(messages[1].content).toContain("2026-11-21");
    expect(messages[1].content).toContain("共 2 张");
  });

  it("过滤模型编造的词与重复项，最多保留 5 条", () => {
    const cards = ["address", "meeting", "problem", "envelope", "finish", "late"].map(
      (word) => card(word),
    );
    const result = parseFocusWordsResponse(
      JSON.stringify({
        words: [
          { word: "address", reason: "忘记 3 次" },
          { word: "ADDRESS", reason: "重复" },
          { word: "invented", reason: "编造" },
          { word: "meeting", reason: "逾期" },
          { word: "problem", reason: "语境难" },
          { word: "envelope", reason: "较长" },
          { word: "finish", reason: "易混" },
          { word: "late", reason: "第 6 条应截断" },
        ],
      }),
      cards,
    );
    expect(result.map((item) => item.word)).toEqual([
      "address",
      "meeting",
      "problem",
      "envelope",
      "finish",
    ]);
    expect(result[0].reason).toBe("忘记 3 次");
  });

  it("模型返回损坏 JSON 时返回空列表；无到期词不发请求", async () => {
    expect(parseFocusWordsResponse("not json", [card("address")])).toEqual([]);
    const chat = vi.fn();
    const coach = createReviewCoach({
      transport: { chat },
      config: { baseUrl: "http://example.test/v1" },
    });
    expect(await coach.suggestFocus([])).toEqual([]);
    expect(chat).not.toHaveBeenCalled();
  });

  it("经传输层获取并解析重点词", async () => {
    const coach = createReviewCoach({
      transport: {
        async chat(call) {
          expect(call.maxTokens).toBe(900);
          return {
            choices: [
              {
                message: {
                  content:
                    '```json\n{"words":[{"word":"address","reason":"近期忘记 2 次"}]}\n```',
                },
              },
            ],
          };
        },
      },
      config: { baseUrl: "http://example.test/v1" },
    });
    expect(await coach.suggestFocus([card("address", 2)])).toEqual([
      { word: "address", reason: "近期忘记 2 次" },
    ]);
  });
});