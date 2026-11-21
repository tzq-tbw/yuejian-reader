import { describe, expect, it } from "vitest";
import { buildDocument, buildParagraphs, joinLineTexts, stripRepeatedMargins } from "./layout";
import type { RawPage, TextLine } from "./types";

function item(str: string, x: number, y: number, height = 12) {
  return { str, transform: [1, 0, 0, 1, x, y], width: Math.max(str.length * 6, 0), height };
}

function page(pageNumber: number, items: ReturnType<typeof item>[]): RawPage {
  return { pageNumber, width: 595, height: 842, items };
}

function line(text: string, pageNumber = 1, y = 100): TextLine {
  return { page: pageNumber, y, x: 80, text, runs: [] };
}

describe("PDF 文字层布局", () => {
  it("按基线聚成行、保留词间空格，并按从上到下排序", () => {
    const doc = buildDocument([
      page(1, [
        item("Body line", 85, 558),
        item("Directions:", 84, 707),
        item(" ", 144, 707, 0),
        item("In this section.", 148, 707),
      ]),
    ]);
    expect(doc.pages[0].lines.map((entry) => entry.text)).toEqual([
      "Directions: In this section.",
      "Body line",
    ]);
    expect(doc.pages[0].lines[0].runs.map((run) => run.text)).toEqual([
      "Directions:",
      "In this section.",
    ]);
  });

  it("丢弃重复页眉和纯页码，保留正文边缘的独有文字", () => {
    const doc = buildDocument([
      page(1, [
        item("2026 年 6 月四级真题", 80, 830),
        item("Unique intro", 80, 810),
        item("Body", 80, 500),
        item("1", 300, 20),
      ]),
      page(2, [item("2026 年 6 月四级真题", 80, 830), item("More body", 80, 500)]),
    ]);
    const stripped = stripRepeatedMargins(doc);
    expect(stripped.pages[0].lines.map((entry) => entry.text)).toEqual([
      "Unique intro",
      "Body",
    ]);
    expect(stripped.pages[1].lines.map((entry) => entry.text)).toEqual(["More body"]);
  });

  it("拼接行尾连字符与下一行小写词", () => {
    expect(joinLineTexts(["there are whale-", "watching trips.", "Next line."])).toBe(
      "there are whale-watching trips. Next line.",
    );
  });

  it("按句末和下一页接续恢复段落", () => {
    const lines: TextLine[] = [
      line("First sentence ends.", 1, 120),
      line("Second paragraph starts here.", 1, 100),
      line("A sentence that is cut off at the page", 2, 800),
      line("boundary continues here.", 2, 780),
      line("New sentence after it.", 2, 760),
    ];
    expect(buildParagraphs(lines)).toEqual([
      "First sentence ends.",
      "Second paragraph starts here.",
      "A sentence that is cut off at the page boundary continues here.",
      "New sentence after it.",
    ]);
  });
});