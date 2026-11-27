import { describe, expect, it } from "vitest";
import { createVocabularyList, tokenizeWithVocabulary, vocabularyMatches } from "./vocabulary";

const first = createVocabularyList("first", "示例词表 A", ["address"]);
const second = createVocabularyList("second", "示例词表 B", ["address", "environmental"]);

describe("导入词表匹配", () => {
  it("未加载任何词表时返回空匹配", () => {
    expect(vocabularyMatches("address")).toEqual([]);
  });

  it("匹配常见屈折形式", () => {
    for (const word of ["address", "addresses", "addressed", "addressing"]) {
      expect(first.contains(word)).toBe(true);
    }
    expect(first.contains("quasar")).toBe(false);
  });

  it("匹配多个已选词表，同时保留原文字符与顺序", () => {
    const text = "We need to address the problems, don't we?";
    const tokens = tokenizeWithVocabulary(text, [first, second]);
    expect(tokens.map((token) => token.text).join("")).toBe(text);
    expect(tokens.find((token) => token.text === "address")?.matches).toEqual([
      { id: "first", label: "示例词表 A" },
      { id: "second", label: "示例词表 B" },
    ]);
    expect(vocabularyMatches("environmental", [first])).toEqual([]);
    expect(vocabularyMatches("environmental", [second])).toEqual([{ id: "second", label: "示例词表 B" }]);
  });
});
