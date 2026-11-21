import { describe, expect, it } from "vitest";
import {
  analyzeReadingDocument,
  parseLetterParagraphs,
  parseQuestions,
  parseSectionB,
  parseStatements,
  recoverBlanks,
} from "./split";
import type { ExtractedDocument, TextLine } from "./types";

function line(text: string, page = 1, y = 100): TextLine {
  return { page, y, x: 80, text, runs: [] };
}

describe("拆篇与题目恢复", () => {
  it("跨页续行并入题干与选项", () => {
    const result = parseQuestions([
      line("46. What is the classic dilemma?", 1, 201),
      line("A) First option.", 1, 178),
      line("B) Second option", 1, 156),
      line("that wraps onto the next page.", 2, 799),
      line("C) Third option.", 2, 777),
      line("D) Fourth option.", 2, 755),
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].stem).toBe("What is the classic dilemma?");
    expect(result.questions[0].options).toEqual([
      { letter: "A", text: "First option." },
      { letter: "B", text: "Second option that wraps onto the next page." },
      { letter: "C", text: "Third option." },
      { letter: "D", text: "Fourth option." },
    ]);
  });

  it("解析带序号的 36–45 陈述句并合并续行", () => {
    const statements = [
      line("Statements:", 1, 220),
      line("1. 36. The author's daughter slept", 1, 200),
      line("throughout the flight.", 1, 180),
      ...Array.from({ length: 9 }, (_, index) =>
        line(`${index + 2}. ${37 + index}. Statement number ${37 + index}.`, 1, 160 - index * 20),
      ),
    ];
    const result = parseStatements(statements);
    expect(result.warnings).toHaveLength(0);
    expect(result.statements).toHaveLength(10);
    expect(result.statements[0]).toEqual({
      number: 36,
      text: "The author's daughter slept throughout the flight.",
    });
    expect(result.statements[9]).toEqual({ number: 45, text: "Statement number 45." });
  });

  it("没有 Statements 标题时保留首条带序号陈述", () => {
    const result = parseSectionB([
      line("Matching title", 1, 320),
      line("A) Paragraph body.", 1, 300),
      line("1. 36. First statement.", 1, 280),
      line("2. 37. Second statement.", 1, 260),
    ]);
    expect(result.questionArea.kind).toBe("matching");
    if (result.questionArea.kind === "matching") {
      expect(result.questionArea.statements).toEqual([
        { number: 36, text: "First statement." },
        { number: 37, text: "Second statement." },
      ]);
    }
    expect(result.paragraphs).toEqual(["A) Paragraph body."]);
  });

  it("识别裸 36 题号为陈述区起点且不混入正文", () => {
    const result = parseSectionB([
      line("A) Paragraph body.", 1, 300),
      line("36. First bare statement.", 1, 280),
      line("37. Second bare statement.", 1, 260),
    ]);
    expect(result.questionArea.kind).toBe("matching");
    if (result.questionArea.kind === "matching") {
      expect(result.questionArea.statements).toEqual([
        { number: 36, text: "First bare statement." },
        { number: 37, text: "Second bare statement." },
      ]);
    }
    expect(result.paragraphs).toEqual(["A) Paragraph body."]);
  });

  it("首条裸题号陈述支持跨页续行", () => {
    const result = parseSectionB([
      line("A) Paragraph body.", 1, 300),
      line("36. First statement continues", 1, 280),
      line("on the next page.", 2, 790),
      line("37. Second statement.", 2, 770),
    ]);
    expect(result.questionArea.kind).toBe("matching");
    if (result.questionArea.kind === "matching") {
      expect(result.questionArea.statements).toEqual([
        { number: 36, text: "First statement continues on the next page." },
        { number: 37, text: "Second statement." },
      ]);
    }
    expect(result.paragraphs).toEqual(["A) Paragraph body."]);
  });

  it("恢复 26–35 的方括号空位并补出可见横线", () => {
    const paragraph = Array.from(
      { length: 10 },
      (_, index) => `Blank [${26 + index}] here.`,
    ).join(" ");
    const result = recoverBlanks([paragraph]);
    expect(result.blanks).toEqual([26, 27, 28, 29, 30, 31, 32, 33, 34, 35]);
    expect(result.warnings).toEqual([]);
    expect(result.paragraphs[0]).toContain("[26] ________");
  });

  it("没有题号但有十个下划线时顺序恢复并提示校对", () => {
    const paragraph = Array.from({ length: 10 }, () => "word __ here").join(" ");
    const result = recoverBlanks([paragraph]);
    expect(result.blanks).toEqual([26, 27, 28, 29, 30, 31, 32, 33, 34, 35]);
    expect(result.warnings[0]).toContain("下划线");
  });

  it("长篇匹配段落按字母跨页合并", () => {
    const result = parseLetterParagraphs([
      line("A) First paragraph begins", 1, 300),
      line("and continues on the next page.", 2, 790),
      line("B) Second paragraph.", 2, 700),
    ]);
    expect(result.letters).toEqual(["A", "B"]);
    expect(result.paragraphs[0]).toContain("continues on the next page");
    expect(result.warnings).toEqual([]);
  });

  it("Section C 拆篇失败时完整保留 A、B、C 原文", () => {
    const doc: ExtractedDocument = {
      pageCount: 1,
      pages: [
        {
          pageNumber: 1,
          width: 595,
          height: 842,
          lines: [
            line("Part III Reading Comprehension", 1, 800),
            line("Section A", 1, 780),
            line("A section text kept in fallback preview with enough English words.", 1, 760),
            line("Section B", 1, 740),
            line("B section text kept in fallback preview and readable.", 1, 720),
            line("Section C", 1, 700),
            line("Passage One", 1, 680),
            line("C passage text kept in fallback preview without second passage.", 1, 660),
          ],
        },
      ],
    };
    const analysis = analyzeReadingDocument(doc);
    expect(analysis.articles).toHaveLength(1);
    expect(analysis.articles[0].questionArea.kind).toBe("raw");
    const text = analysis.articles[0].paragraphs.join(" ");
    expect(text).toContain("A section text kept in fallback preview");
    expect(text).toContain("B section text kept in fallback preview");
    expect(text).toContain("C passage text kept in fallback preview");
  });

  it("无文字层时给出明确错误", () => {
    const doc: ExtractedDocument = {
      pageCount: 1,
      pages: [{ pageNumber: 1, width: 595, height: 842, lines: [] }],
    };
    expect(() => analyzeReadingDocument(doc)).toThrow("没有可提取的文字层");
  });

  it("找不到 Part III 时保留整段原文供预览校对", () => {
    const doc: ExtractedDocument = {
      pageCount: 1,
      pages: [
        {
          pageNumber: 1,
          width: 595,
          height: 842,
          lines: [
            line("A long reading passage without a Part III heading.", 1, 700),
            line("It still has enough English text for preview.", 1, 680),
          ],
        },
      ],
    };
    const analysis = analyzeReadingDocument(doc);
    expect(analysis.articles).toHaveLength(1);
    expect(analysis.articles[0].questionArea.kind).toBe("raw");
    expect(analysis.articles[0].warnings[0]).toContain("Part III");
    expect(analysis.warnings).toHaveLength(1);
  });
});