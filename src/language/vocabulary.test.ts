import { describe, expect, it } from "vitest";
import {
  CET4_LIST,
  CET6_LIST,
  DEFAULT_VOCABULARY_LISTS,
  POSTGRADUATE_LIST,
  tokenizeWithVocabulary,
  vocabularyMatches,
} from "./vocabulary";
import { CET4_WORDS } from "./wordlists/cet4";
import { CET6_WORDS } from "./wordlists/cet6";
import { POSTGRADUATE_WORDS } from "./wordlists/postgraduate";

describe("考试高频词表", () => {
  it("三表各有 1600 个不重复的纯英文单词", () => {
    for (const words of [CET4_WORDS, CET6_WORDS, POSTGRADUATE_WORDS]) {
      expect(words).toHaveLength(1600);
      expect(new Set(words).size).toBe(words.length);
      expect(words.every((word) => /^[a-z]+$/.test(word))).toBe(true);
    }
  });

  it("默认同时启用四级、六级和考研词表", () => {
    expect(DEFAULT_VOCABULARY_LISTS).toEqual([
      CET4_LIST,
      CET6_LIST,
      POSTGRADUATE_LIST,
    ]);
  });

  it("匹配常见屈折形式", () => {
    expect(CET4_LIST.contains("address")).toBe(true);
    expect(CET4_LIST.contains("addresses")).toBe(true);
    expect(CET4_LIST.contains("addressed")).toBe(true);
    expect(CET4_LIST.contains("addressing")).toBe(true);
    expect(CET4_LIST.contains("quasar")).toBe(false);
  });

  it("重叠词返回并显示全部命中类别", () => {
    const expected = [
      { id: "cet4", label: "四级高频" },
      { id: "cet6", label: "六级高频" },
      { id: "ky", label: "考研高频" },
    ];
    expect(vocabularyMatches("address")).toEqual(expected);

    const text = "We need to address the problems, don't we?";
    const tokens = tokenizeWithVocabulary(text);
    expect(tokens.map((token) => token.text).join("")).toBe(text);
    const address = tokens.find((token) => token.text === "address");
    expect(address?.matches).toEqual(expected);
    expect(address?.matches.map((match) => match.id).join(" ")).toBe("cet4 cet6 ky");
    expect(address?.matches.map((match) => match.label).join(" · ")).toBe(
      "四级高频 · 六级高频 · 考研高频",
    );
  });

  it("可独立开关词表且不影响其他命中", () => {
    expect(vocabularyMatches("address", [CET4_LIST, POSTGRADUATE_LIST])).toEqual([
      { id: "cet4", label: "四级高频" },
      { id: "ky", label: "考研高频" },
    ]);
    expect(vocabularyMatches("address", [CET6_LIST])).toEqual([
      { id: "cet6", label: "六级高频" },
    ]);
    expect(vocabularyMatches("address", [])).toEqual([]);
  });

  it("没有命中时返回空列表", () => {
    expect(vocabularyMatches("quasar")).toEqual([]);
  });
});
