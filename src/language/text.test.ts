import { describe, expect, it } from "vitest";
import { isSingleWord, sentenceAt } from "./text";

describe("文本与选区辅助", () => {
  it("识别单词与短语", () => {
    expect(isSingleWord("address")).toBe(true);
    expect(isSingleWord("don't")).toBe(true);
    expect(isSingleWord("well-being")).toBe(true);
    expect(isSingleWord("address the problem")).toBe(false);
    expect(isSingleWord("address,")).toBe(false);
    expect(isSingleWord("")).toBe(false);
  });

  it("按标点截取偏移所在的原句", () => {
    const paragraph =
      "We need to address the problem. Please write your address on the envelope! Will you?";
    expect(sentenceAt(paragraph, paragraph.indexOf("address"))).toBe(
      "We need to address the problem.",
    );
    expect(sentenceAt(paragraph, paragraph.indexOf("envelope"))).toBe(
      "Please write your address on the envelope!",
    );
    expect(sentenceAt(paragraph, paragraph.indexOf("Will"))).toBe("Will you?");
    expect(sentenceAt(paragraph, paragraph.length)).toBe("Will you?");
  });

  it("空段落返回空字符串", () => {
    expect(sentenceAt("", 0)).toBe("");
  });
});