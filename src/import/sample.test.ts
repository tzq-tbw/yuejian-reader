// @vitest-environment node
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { createMemoryStorage, createMockApi } from "../data/mock";
import type { ImportSuiteResult, ReaderApi } from "../data/types";
import { sha256Hex } from "./fingerprint";
import { extractPdf } from "./pdf";
import { analyzeReadingDocument } from "./split";

/**
 * 真实样卷回归：只有设置 T002_SAMPLE_PDF 指向样卷时才执行，
 * 仓库内不保存真题文件。负责人验收时可用同一路径复跑。
 */
const samplePath = process.env.T002_SAMPLE_PDF ?? "";
const hasSample = Boolean(samplePath && fs.existsSync(samplePath));
GlobalWorkerOptions.workerSrc = pathToFileURL(
  resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
).href;

function fileBytes(path: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path));
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function extractFingerprintImport(
  api: ReaderApi,
  title: string,
  bytes: Uint8Array,
): Promise<{ fingerprint: string; result: ImportSuiteResult }> {
  const buffer = arrayBuffer(bytes);
  const doc = await extractPdf(buffer);
  const fingerprint = await sha256Hex(buffer);
  expect(buffer.byteLength).toBe(bytes.byteLength);
  const analysis = analyzeReadingDocument(doc);
  expect(analysis.articles).toHaveLength(4);
  const result = await api.importSuite({
    title,
    fingerprint,
    examLevel: "四级",
    articles: analysis.articles.map((article) => ({
      title: article.title,
      examType: article.examType,
      sequenceNo: article.sequenceNo,
      pageRange: article.pageRange || null,
      questionRange: article.questionRange || null,
      questionArea: JSON.stringify(article.questionArea),
      paragraphs: article.paragraphs,
    })),
  });
  return { fingerprint, result };
}

describe.skipIf(!hasSample)("阶段 2 · 真实四级样卷", () => {
  it("识别 4 张阅读卡、跨页边界、题号和空位", async () => {
    const doc = await extractPdf(arrayBuffer(fileBytes(samplePath)));
    expect(doc.pageCount).toBe(14);
    const analysis = analyzeReadingDocument(doc);
    expect(analysis.warnings).toEqual([]);
    expect(analysis.articles).toHaveLength(4);

    const [a, b, c1, c2] = analysis.articles;
    expect(a.examType).toBe("选词填空");
    expect(a.pageRange).toBe("6–7");
    expect(a.questionRange).toBe("26–35");
    expect(a.questionArea.kind).toBe("banked_cloze");
    if (a.questionArea.kind === "banked_cloze") {
      expect(a.questionArea.blanks).toEqual([26, 27, 28, 29, 30, 31, 32, 33, 34, 35]);
      expect(a.questionArea.wordBank).toHaveLength(15);
      expect(a.questionArea.wordBank[14]).toEqual({ letter: "O", word: "typically" });
    }
    expect(a.warnings).toEqual([]);

    expect(b.examType).toBe("长篇匹配");
    expect(b.pageRange).toBe("7–9");
    expect(b.questionRange).toBe("36–45");
    expect(b.title).toBe("The Star Quality of New Zealand's Great Barrier Island");
    expect(b.questionArea.kind).toBe("matching");
    if (b.questionArea.kind === "matching") {
      expect(b.questionArea.paragraphLetters).toHaveLength(12);
      expect(b.questionArea.paragraphLetters.join("")).toBe("ABCDEFGHIJKL");
      expect(b.questionArea.statements.map((item) => item.number)).toEqual([
        36, 37, 38, 39, 40, 41, 42, 43, 44, 45,
      ]);
    }
    // 跨页段落 E 从 p7 末尾接到 p8 开头；L) 在 p9 顶部
    expect(b.paragraphs.some((text) => text.includes("side of the island where the surf is better"))).toBe(
      true,
    );
    expect(b.paragraphs.some((text) => text.startsWith("E) "))).toBe(true);
    expect(b.paragraphs.some((text) => text.startsWith("L) Apparently"))).toBe(true);
    expect(b.paragraphs.some((text) => text.includes("whale-watching trips"))).toBe(true);
    expect(b.warnings).toEqual([]);

    expect(c1.examType).toBe("仔细阅读");
    expect(c1.pageRange).toBe("9–11");
    expect(c1.questionRange).toBe("46–50");
    expect(c1.questionArea.kind).toBe("multiple_choice");
    if (c1.questionArea.kind === "multiple_choice") {
      expect(c1.questionArea.questions.map((question) => question.number)).toEqual([
        46, 47, 48, 49, 50,
      ]);
      expect(c1.questionArea.questions.every((question) => question.options.length === 4)).toBe(
        true,
      );
    }
    expect(c1.paragraphs.join(" ")).toContain("Is organic food worth the higher price?");
    expect(c1.paragraphs[0]).not.toContain("Passage One");
    expect(c1.warnings).toEqual([]);

    expect(c2.examType).toBe("仔细阅读");
    expect(c2.pageRange).toBe("11–13");
    expect(c2.questionRange).toBe("51–55");
    expect(c2.questionArea.kind).toBe("multiple_choice");
    if (c2.questionArea.kind === "multiple_choice") {
      expect(c2.questionArea.questions.map((question) => question.number)).toEqual([
        51, 52, 53, 54, 55,
      ]);
      expect(c2.questionArea.questions.every((question) => question.options.length === 4)).toBe(
        true,
      );
    }
    // Passage Two 从 p11 接到 p12 的跨页句
    expect(c2.paragraphs.join(" ")).toContain("split a sum of money with a peer");
    expect(c2.paragraphs[0]).not.toContain("Passage Two");
    expect(c2.warnings).toEqual([]);
  });

  it("连续导入两份不同 PDF 时按真实文件指纹生成两套卡", async () => {
    const first = fileBytes(samplePath);
    const suffix = new TextEncoder().encode("\n% T-002 different PDF\n");
    const second = new Uint8Array(first.length + suffix.length);
    second.set(first);
    second.set(suffix, first.length);

    const api = createMockApi(createMemoryStorage());
    const one = await extractFingerprintImport(api, "四级样卷一", first);
    const two = await extractFingerprintImport(api, "四级样卷二", second);

    expect(one.fingerprint).not.toBe(two.fingerprint);
    expect(one.result.created).toBe(true);
    expect(two.result.created).toBe(true);
    expect(one.result.suiteId).not.toBe(two.result.suiteId);
    expect(one.result.articles).toHaveLength(4);
    expect(two.result.articles).toHaveLength(4);
    const library = await api.listLibrary();
    expect(library).toHaveLength(2);
    expect(library.flatMap((group) => group.articles)).toHaveLength(8);
  });
});
