import { describe, expect, it } from "vitest";
import {
  articleTarget,
  paragraphTarget,
  sameSelectionRange,
  selectionTarget,
} from "./targets";

const article = {
  id: 7,
  version: 3,
  paragraphs: ["We need to address the problem.", "Write your address."],
};

const selection = {
  text: "address the problem.\n\nWrite your address",
  start: { paragraph: 0, offset: 11 },
  end: { paragraph: 1, offset: 25 },
  paragraphs: [
    { index: 0, text: "address the problem." },
    { index: 1, text: "Write your address" },
  ],
};

describe("请求目标", () => {
  it("选区目标携带文章 ID、版本、选区起止和操作类别", () => {
    const target = selectionTarget(article, "translate", selection);
    expect(target).toEqual({
      articleId: 7,
      version: 3,
      operation: "translate",
      start: { paragraph: 0, offset: 11 },
      end: { paragraph: 1, offset: 25 },
      paragraphs: [0, 1],
      text: selection.text,
    });
  });

  it("段落目标覆盖整段偏移", () => {
    expect(paragraphTarget(article, 1)).toMatchObject({
      operation: "paragraph",
      start: { paragraph: 1, offset: 0 },
      end: { paragraph: 1, offset: "Write your address.".length },
      paragraphs: [1],
      text: "Write your address.",
    });
  });

  it("全文目标覆盖所有段落", () => {
    expect(articleTarget(article)).toMatchObject({
      operation: "article",
      start: { paragraph: 0, offset: 0 },
      end: { paragraph: 1, offset: "Write your address.".length },
      paragraphs: [0, 1],
    });
  });

  it("同选区比较忽略操作类别，但区分版本与起止", () => {
    const a = selectionTarget(article, "translate", selection);
    const b = selectionTarget(article, "parse", selection);
    expect(sameSelectionRange(a, b)).toBe(true);
    expect(
      sameSelectionRange(a, { ...b, version: 4 }),
    ).toBe(false);
    expect(
      sameSelectionRange(a, { ...b, end: { paragraph: 1, offset: 24 } }),
    ).toBe(false);
  });
});