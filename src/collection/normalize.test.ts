import { describe, expect, it } from "vitest";
import {
  isCompleteSingleSentence,
  isPhraseSelection,
  sentenceCount,
  shouldConfirmLongSentence,
} from "./sentence";
import { normalizeCollectionKey } from "./normalize";

describe("收藏去重键规范化", () => {
  it("忽略大小写并合并连续空白，保留词序和标点", () => {
    expect(normalizeCollectionKey("  Address  ")).toBe("address");
    expect(
      normalizeCollectionKey("We  need\nto address\t the problem."),
    ).toBe("we need to address the problem.");
    expect(normalizeCollectionKey("  Take   Off ")).toBe("take off");
    expect(normalizeCollectionKey("Don't stop!")).toBe("don't stop!");
  });

  it("只合并空白，不删除标点或改变词序", () => {
    expect(normalizeCollectionKey("A, B.")).toBe("a, b.");
    expect(normalizeCollectionKey("B A")).not.toBe(
      normalizeCollectionKey("A B"),
    );
  });
});

describe("长难句收藏选区判定", () => {
  it("完整单句直接收藏", () => {
    expect(isCompleteSingleSentence("We need to address the problem.")).toBe(true);
    expect(
      isCompleteSingleSentence("“We need to address the problem.”"),
    ).toBe(true);
    expect(
      shouldConfirmLongSentence("We need to address the problem.", 0, 0),
    ).toBe(false);
  });

  it("多句、无句末标点或跨段选区需要确认", () => {
    expect(
      isCompleteSingleSentence("First sentence. Second sentence."),
    ).toBe(false);
    expect(
      shouldConfirmLongSentence("First sentence. Second sentence.", 0, 0),
    ).toBe(true);
    expect(shouldConfirmLongSentence("A sentence fragment", 0, 0)).toBe(true);
    expect(
      shouldConfirmLongSentence(
        "We need to address the problem before the meeting.",
        0,
        1,
      ),
    ).toBe(true);
    expect(sentenceCount("One. Two! Three?")).toBe(3);
  });

  it("识别短语候选与整段", () => {
    expect(isPhraseSelection("take off", 0, 0)).toBe(true);
    expect(isPhraseSelection("in order to", 0, 0)).toBe(true);
    expect(isPhraseSelection("address", 0, 0)).toBe(false);
    expect(isPhraseSelection("a phrase across paragraphs", 0, 1)).toBe(false);
    expect(isPhraseSelection("a complete sentence.", 0, 0)).toBe(false);
    expect(
      shouldConfirmLongSentence(
        "This whole paragraph has no final punctuation",
        2,
        2,
      ),
    ).toBe(true);
  });
});