import { describe, expect, it } from "vitest";
import {
  CET4_SAMPLE_LIST,
  tokenizeWithVocabulary,
  vocabularyMatches,
} from "./vocabulary";

describe("四级词表标色", () => {
  it("匹配常见屈折形式", () => {
    expect(CET4_SAMPLE_LIST.contains("address")).toBe(true);
    expect(CET4_SAMPLE_LIST.contains("addresses")).toBe(true);
    expect(CET4_SAMPLE_LIST.contains("addressed")).toBe(true);
    expect(CET4_SAMPLE_LIST.contains("walking")).toBe(true);
    expect(CET4_SAMPLE_LIST.contains("quasar")).toBe(false);
  });

  it("切分后原文完全保留，命中词带类别", () => {
    const text = "We need to address the problems, don't we?";
    const tokens = tokenizeWithVocabulary(text);
    expect(tokens.map((token) => token.text).join("")).toBe(text);
    const address = tokens.find((token) => token.text === "address");
    expect(address?.matches.map((match) => match.id)).toEqual(["cet4"]);
    expect(vocabularyMatches("the")).toHaveLength(0);
  });

  it("没有命中时返回空列表", () => {
    expect(vocabularyMatches("quasar")).toEqual([]);
  });
});