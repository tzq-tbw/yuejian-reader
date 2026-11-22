import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReaderView } from "./ReaderView";
import type { ArticleDetail, ReaderApi } from "../data/types";
import "../styles.css";

const article: ArticleDetail = {
  id: 1,
  title: "Highlight test",
  topic: "教育与学习",
  version: 1,
  paragraphCount: 1,
  wordCount: 4,
  suiteId: null,
  suiteTitle: null,
  examType: null,
  sequenceNo: null,
  pageRange: null,
  questionRange: null,
  sectionCount: 0,
  updatedAt: "2026-11-22T00:00:00Z",
  paragraphs: ["cetfour cetsix postgraduate address"],
  source: "paste",
  createdAt: "2026-11-22T00:00:00Z",
  sectionIds: [],
  questionArea: null,
};

function highlightApi(): ReaderApi {
  const lists = [
    { id: "cet4", name: "四级高频", words: ["cetfour", "address"] },
    { id: "cet6", name: "六级高频", words: ["cetsix", "address"] },
    { id: "ky", name: "考研高频", words: ["postgraduate", "address"] },
  ];
  return {
    listWordlists: vi.fn().mockResolvedValue(lists.map(({ id, name }) => ({
      id,
      name,
      source: "test",
      enabled: true,
      builtIn: true,
      wordCount: 2,
    }))),
    listWords: vi.fn().mockResolvedValue(lists),
  } as unknown as ReaderApi;
}

function renderReader(api: ReaderApi) {
  return render(
    <ReaderView
      api={api}
      notify={vi.fn()}
      article={article}
      paragraphTarget={null}
      sectionName="我的阅读"
      currentSectionId="default"
      editor={null}
      saving={false}
      editorError=""
      listOpen
      sideOpen
      onExpandList={vi.fn()}
      onExpandSide={vi.fn()}
      onStartEdit={vi.fn()}
      onSaveEditor={vi.fn()}
      onCancelEdit={vi.fn()}
      onChangeDraft={vi.fn()}
      onOpenPicker={vi.fn()}
      onOpenPaste={vi.fn()}
      onGoLibrary={vi.fn()}
      onAskWord={vi.fn()}
      onTranslateSelection={vi.fn()}
      onAnalyzeSelection={vi.fn()}
      onTranslateParagraph={vi.fn()}
      onTranslateArticle={vi.fn()}
    />,
  );
}

beforeEach(() => window.localStorage.clear());

describe("阅读页词表分色", () => {
  it("按 list_id 渲染三色类、重叠类和图例", async () => {
    renderReader(highlightApi());

    expect(await screen.findByText("cetfour")).toHaveClass("vocabMark", "cet4");
    expect(screen.getByText("cetfour")).not.toHaveClass("cet6", "ky");
    expect(screen.getByText("cetsix")).toHaveClass("vocabMark", "cet6");
    expect(screen.getByText("postgraduate")).toHaveClass("vocabMark", "ky");
    expect(screen.getByText("address")).toHaveClass("vocabMark", "cet4", "cet6", "ky");
    expect(screen.getByText("address")).toHaveAttribute("title", "四级高频 · 六级高频 · 考研高频");
    expect(window.getComputedStyle(screen.getByText("cetfour")).backgroundColor).toBe("rgb(220, 236, 255)");
    expect(window.getComputedStyle(screen.getByText("cetsix")).backgroundColor).toBe("rgb(239, 225, 255)");
    expect(window.getComputedStyle(screen.getByText("postgraduate")).backgroundColor).toBe("rgb(255, 234, 210)");
    expect(window.getComputedStyle(screen.getByText("address")).boxShadow).toContain("#2472d0");
    expect(window.getComputedStyle(screen.getByText("address")).boxShadow).toContain("#8250c7");
    expect(window.getComputedStyle(screen.getByText("address")).boxShadow).toContain("#d66a16");
    const legend = screen.getByLabelText("词表高亮图例");
    expect(legend).toHaveTextContent("四级高频");
    expect(legend).toHaveTextContent("六级高频");
    expect(legend).toHaveTextContent("考研高频");
    expect(legend).toHaveTextContent("重叠命中以多色下划线区分");
  });
});
