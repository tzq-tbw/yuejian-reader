import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryStorage, createMockApi } from "../data/mock";
import type { ReaderApi } from "../data/types";
import { PdfImportDialog } from "./PdfImportDialog";
import { extractPdf } from "./pdf";
import { analyzeReadingDocument } from "./split";
import type { CandidateArticle } from "./types";

const mocks = vi.hoisted(() => {
  const articles = [
    {
      title: "选词填空（26–35）",
      examType: "选词填空",
      sequenceNo: 1,
      pageRange: "6–7",
      questionRange: "26–35",
      paragraphs: ["The working class [26] ________ changed over time."],
      questionArea: {
        kind: "banked_cloze",
        blanks: [26],
        wordBank: [{ letter: "A", word: "available" }],
      },
      warnings: [],
    },
    {
      title: "The Star Quality of New Zealand's Great Barrier Island",
      examType: "长篇匹配",
      sequenceNo: 2,
      pageRange: "7–9",
      questionRange: "36–45",
      paragraphs: ["A) A long matching passage paragraph."],
      questionArea: {
        kind: "matching",
        statements: [{ number: 36, text: "A matching statement." }],
        paragraphLetters: ["A"],
      },
      warnings: [],
    },
    {
      title: "仔细阅读 · Passage One",
      examType: "仔细阅读",
      sequenceNo: 3,
      pageRange: "9–11",
      questionRange: "46–50",
      paragraphs: ["Is organic food worth the higher price?"],
      questionArea: {
        kind: "multiple_choice",
        questions: [
          {
            number: 46,
            stem: "What is the dilemma?",
            options: [
              { letter: "A", text: "First." },
              { letter: "B", text: "Second." },
              { letter: "C", text: "Third." },
              { letter: "D", text: "Fourth." },
            ],
          },
        ],
      },
      warnings: [],
    },
    {
      title: "仔细阅读 · Passage Two",
      examType: "仔细阅读",
      sequenceNo: 4,
      pageRange: "11–13",
      questionRange: "51–55",
      paragraphs: ["It is still controversial whether we are generous or selfish."],
      questionArea: {
        kind: "multiple_choice",
        questions: [],
      },
      warnings: [],
    },
  ] satisfies CandidateArticle[];
  return { articles };
});

vi.mock("./pdf", () => ({ extractPdf: vi.fn() }));
vi.mock("./split", () => ({ analyzeReadingDocument: vi.fn() }));
vi.mock("./fingerprint", () => ({ sha256Hex: vi.fn(async () => "test-fingerprint") }));

function fakeFile(name = "2026年6月大学英语四级真题（第1套）.pdf"): File {
  return {
    name,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as File;
}

beforeEach(() => {
  vi.mocked(extractPdf).mockReset();
  vi.mocked(extractPdf).mockResolvedValue({ pageCount: 14, pages: [] });
  vi.mocked(analyzeReadingDocument).mockReset();
  vi.mocked(analyzeReadingDocument).mockReturnValue({
    articles: mocks.articles,
    warnings: [],
  });
});

describe("PDF 导入预览", () => {
  it("解析后显示四张卡，校对后一套卷一次导入", async () => {
    const api = createMockApi(createMemoryStorage());
    const onImported = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <PdfImportDialog
        api={api}
        file={fakeFile()}
        onClose={onClose}
        onImported={onImported}
        onRetryPick={vi.fn()}
      />,
    );

    expect(await screen.findByText(/已提取 14 页文字/)).toBeInTheDocument();
    const suiteTitle = screen.getByLabelText("套卷名称") as HTMLInputElement;
    expect(suiteTitle.value).toBe("2026年6月大学英语四级真题（第1套）");
    expect(screen.getByText(/空位 1 个 · 候选词 1 个/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "导入 4 篇" }));
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);

    const result = onImported.mock.calls[0][0];
    expect(result.created).toBe(true);
    expect(result.articles).toHaveLength(4);
    const groups = await api.listLibrary();
    expect(groups[0].title).toBe("2026年6月大学英语四级真题（第1套）");
    expect(groups[0].articles[0].pageRange).toBe("6–7");
  });

  it("无文字层时提示错误并可重新选择文件", async () => {
    vi.mocked(extractPdf).mockRejectedValueOnce(
      new Error("这个 PDF 没有可提取的文字层。首版只支持带文字层的试卷 PDF。"),
    );
    const onRetryPick = vi.fn();
    const user = userEvent.setup();
    render(
      <PdfImportDialog
        api={createMockApi(createMemoryStorage())}
        file={fakeFile("扫描件.pdf")}
        onClose={vi.fn()}
        onImported={vi.fn()}
        onRetryPick={onRetryPick}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("没有可提取的文字层");
    await user.click(screen.getByRole("button", { name: /重新选择文件/ }));
    expect(onRetryPick).toHaveBeenCalledTimes(1);
  });

  it("导入失败保留预览，可原卡重试", async () => {
    const importSuite = vi
      .fn()
      .mockRejectedValueOnce(new Error("磁盘已满，请重试"))
      .mockResolvedValueOnce({
        suiteId: "suite-1",
        title: "2026年6月大学英语四级真题（第1套）",
        created: true,
        articles: [],
      });
    const api = { importSuite } as unknown as ReaderApi;
    const onImported = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <PdfImportDialog
        api={api}
        file={fakeFile()}
        onClose={onClose}
        onImported={onImported}
        onRetryPick={vi.fn()}
      />,
    );

    await screen.findByText(/已提取 14 页文字/);
    await user.click(screen.getByRole("button", { name: "导入 4 篇" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("磁盘已满");
    expect(screen.getByRole("button", { name: "导入 4 篇" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "导入 4 篇" }));
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(importSuite).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("取消预览不提交导入", async () => {
    const importSuite = vi.fn();
    const api = { importSuite } as unknown as ReaderApi;
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <PdfImportDialog
        api={api}
        file={fakeFile()}
        onClose={onClose}
        onImported={vi.fn()}
        onRetryPick={vi.fn()}
      />,
    );

    await screen.findByText(/已提取 14 页文字/);
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(importSuite).not.toHaveBeenCalled();
  });
});