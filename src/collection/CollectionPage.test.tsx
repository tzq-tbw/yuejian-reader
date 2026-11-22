import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { createMemoryStorage, createMockApi } from "../data/mock";
import type { LanguageService } from "../language/types";
import { localDateKey } from "../review/schedule";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const language: LanguageService = {
  async wordCard() {
    throw new Error("本用例不生成词卡");
  },
  async translate(input) {
    return {
      kind: "translation",
      target: input.target,
      mode: "selection",
      source: input.text,
      translation: "补全后的译文",
      rows: null,
    };
  },
  async analyze(input) {
    return {
      kind: "analysis",
      target: input.target,
      source: input.text,
      trunk: "补全后的语法主干",
      clauses: [],
      modifiers: [],
      collocations: [],
    };
  },
};

describe("收藏页", () => {
  it("展示来源与快照，回看原文、补全缺失解析并逐条移除", async () => {
    const storage = createMemoryStorage();
    const api = createMockApi(storage);
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const article = await api.pasteArticle({
      title: "Collection Source",
      text: "The opening paragraph comes first.\n\nWe need to address the problem before the meeting.",
    });
    await api.addWordFavorite({
      word: "address",
      sentence: "We need to address the problem before the meeting.",
      articleId: article.id,
      paragraphStart: 1,
      paragraphEnd: 1,
      contextualMeaning: "着手处理",
      commonMeaning: "地址；演说",
      today: localDateKey(),
    });
    await api.addLongSentenceFavorite({
      sourceText: "We need to address the problem before the meeting.",
      translation: "我们需要在会前处理这个问题。",
      analysis: null,
      articleId: article.id,
      paragraphStart: 1,
      paragraphEnd: 1,
    });

    const user = userEvent.setup();
    render(<App api={api} language={language} />);
    await screen.findAllByText("我的阅读");
    await user.click(screen.getByRole("button", { name: "收藏" }));
    await screen.findByRole("heading", { name: "收藏" });
    await user.click(screen.getByRole("button", { name: "展开词语 address" }));

    // 生词本展开后展示词形、原句、语境义和来源
    expect(screen.getByText("address")).toBeInTheDocument();
    expect(
      screen.getByText("We need to address the problem before the meeting."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /规范化词形：address · 规范化原句：we need to address the problem before the meeting\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("着手处理")).toBeInTheDocument();
    expect(screen.getByText(/来源：Collection Source · 第 2 段/)).toBeInTheDocument();

    // 来源回看进入阅读工作台，并滚动到收藏的起始段
    await user.click(screen.getByRole("button", { name: "回看原文" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Collection Source" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    });
    expect(scrollIntoView.mock.instances[0]).toHaveAttribute("data-i", "1");

    // 长难句本标出缺项，并可用模型补全
    await user.click(screen.getByRole("button", { name: "收藏" }));
    await screen.findByRole("heading", { name: "收藏" });
    await user.click(screen.getByRole("tab", { name: /长难句本/ }));
    expect(screen.getByText("解析待补全")).toBeInTheDocument();
    expect(screen.getByText("我们需要在会前处理这个问题。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /补全解析/ }));
    expect(await screen.findByText("补全后的语法主干")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("解析待补全")).not.toBeInTheDocument();
    });

    // 逐条移除长难句
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "移除这条长难句" }));
    expect(await screen.findByText("长难句本还是空的")).toBeInTheDocument();

    // 逐条移除词语，活动队列同步清空
    await user.click(screen.getByRole("tab", { name: /生词本/ }));
    await user.click(screen.getByRole("button", { name: "展开词语 address" }));
    await user.click(screen.getByRole("button", { name: "移除词语 address" }));
    expect(await screen.findByText("生词本还是空的")).toBeInTheDocument();
    expect(await api.listWordFavorites(localDateKey())).toEqual([]);
    expect(await api.listDueWordFavorites(localDateKey())).toEqual([]);
  });

  it("生词默认折叠、点击展开收起", async () => {
    const api = createMockApi(createMemoryStorage());
    const article = await api.pasteArticle({
      title: "Export Source",
      text: "We need to address the problem.\n\nThis is a brief summary.",
    });
    await api.addWordFavorite({
      word: "address",
      sentence: "We need to address the problem.",
      articleId: article.id,
      paragraphStart: 0,
      paragraphEnd: 0,
      contextualMeaning: "着手处理",
      commonMeaning: "地址；演说",
      partOfSpeech: "v.",
      today: localDateKey(),
    });
    await api.addWordFavorite({
      word: 'brief, "summary"',
      sentence: "This is a brief summary.",
      articleId: article.id,
      paragraphStart: 1,
      paragraphEnd: 1,
      contextualMeaning: "不应导出的语境义",
      commonMeaning: "简短, 概要；“摘要”",
      partOfSpeech: "n.",
      today: localDateKey(),
    });
    await api.addLongSentenceFavorite({
      sourceText: "LONG SENTENCE MUST NOT EXPORT",
      translation: "不应导出的长难句",
      articleId: article.id,
      paragraphStart: 0,
      paragraphEnd: 0,
    });

    const user = userEvent.setup();
    render(<App api={api} language={language} />);
    await screen.findAllByText("我的阅读");
    await user.click(screen.getByRole("button", { name: "收藏" }));
    const addressSummary = await screen.findByRole("button", {
      name: "展开词语 address",
    });
    const otherSummary = screen.getByRole("button", {
      name: '展开词语 brief, "summary"',
    });

    expect(addressSummary).toHaveAttribute("aria-expanded", "false");
    expect(otherSummary).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("v.")).toBeInTheDocument();
    expect(screen.getByText("地址")).toBeInTheDocument();
    expect(screen.queryByText("We need to address the problem.")).not.toBeInTheDocument();
    expect(screen.queryByText("着手处理")).not.toBeInTheDocument();
    expect(screen.queryByText(/来源：Export Source/)).not.toBeInTheDocument();

    await user.click(addressSummary);
    const expandedAddress = screen.getByRole("button", { name: "收起词语 address" });
    expect(expandedAddress).toHaveAttribute("aria-expanded", "true");
    expect(otherSummary).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("We need to address the problem.")).toBeInTheDocument();
    expect(screen.getByText("着手处理")).toBeInTheDocument();
    expect(screen.getByText(/来源：Export Source · 第 1 段/)).toBeInTheDocument();
    expect(document.getElementById(expandedAddress.getAttribute("aria-controls")!))
      .toHaveTextContent("规范化词形：address");

    await user.click(expandedAddress);
    expect(screen.getByRole("button", { name: "展开词语 address" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("着手处理")).not.toBeInTheDocument();

  });

  it("来源段落已删除时回到文章开头，收藏快照仍可查看", async () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const api = createMockApi(createMemoryStorage());
    const article = await api.pasteArticle({
      title: "Edited Source",
      text: "Opening paragraph.\n\nOriginal second paragraph.",
    });
    await api.addWordFavorite({
      word: "original",
      sentence: "Original second paragraph.",
      articleId: article.id,
      paragraphStart: 1,
      paragraphEnd: 1,
      contextualMeaning: "原来的",
      commonMeaning: "原件",
      today: localDateKey(),
    });
    await api.updateArticle({
      id: article.id,
      title: article.title,
      topic: article.topic,
      paragraphs: ["Only the opening remains."],
      expectedVersion: article.version,
    });

    const user = userEvent.setup();
    render(<App api={api} language={language} />);
    await screen.findAllByText("我的阅读");
    await user.click(screen.getByRole("button", { name: "收藏" }));
    await user.click(
      await screen.findByRole("button", { name: "展开词语 original" }),
    );
    await user.click(screen.getByRole("button", { name: "回看原文" }));

    await waitFor(() => {
      expect(document.querySelector('p[data-i="0"]')).toHaveTextContent(
        "Only the opening remains.",
      );
    });
    expect(document.querySelector<HTMLElement>(".paper")?.scrollTop).toBe(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "收藏" }));
    await user.click(
      await screen.findByRole("button", { name: "展开词语 original" }),
    );
    expect(screen.getByText("Original second paragraph.")).toBeInTheDocument();
    expect(screen.getByText("原来的")).toBeInTheDocument();
  });
});