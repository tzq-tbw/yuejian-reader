import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { createMemoryStorage, createMockApi } from "../data/mock";
import { addLocalDays, localDateKey } from "./schedule";
import { ReviewPage } from "./ReviewPage";

const TODAY = localDateKey();
const ANALYSIS = JSON.stringify({
  trunk: "We still finished the work.",
  clauses: [
    {
      text: "Although the meeting started late",
      explanation: "让步状语从句",
    },
  ],
  modifiers: ["late 修饰 started"],
  collocations: [],
});

beforeEach(() => {
  window.localStorage.clear();
});

async function renderAppWithStorage() {
  const storage = createMemoryStorage();
  const api = createMockApi(storage);
  const user = userEvent.setup();
  const view = render(<App api={api} />);
  await screen.findAllByText("我的阅读");
  return { storage, api, user, view };
}

async function openReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "复习" }));
  await screen.findByRole("heading", { name: "复习" });
}

async function seedReviewWord(
  api: ReturnType<typeof createMockApi>,
  articleId: number,
  word: string,
  today: string,
) {
  return api.addWordFavorite({
    word,
    sentence: `A sentence containing ${word} for review.`,
    articleId,
    paragraphStart: 0,
    paragraphEnd: 0,
    contextualMeaning: `${word} 的语境义`,
    commonMeaning: `${word} 的常见义`,
    today,
  });
}

describe("复习窗口持久化", () => {
  it("词语窗口：忘记排到队尾可再揭晓，最终记得后同日不再出现、次日到期", async () => {
    const { storage, api, user, view } = await renderAppWithStorage();
    const article = await api.pasteArticle({
      title: "Review Source",
      text: "We need to address the problem before the meeting.",
    });
    const created = await api.addWordFavorite({
      word: "address",
      sentence: "We need to address the problem before the meeting.",
      articleId: article.id,
      paragraphStart: 0,
      paragraphEnd: 0,
      contextualMeaning: "着手处理",
      commonMeaning: "地址；演说",
      today: addLocalDays(TODAY, -1),
    });
    expect(created.favorite.dueDate).toBe(TODAY);

    await openReview(user);
    expect(await screen.findByText(/今日 1 张/)).toBeInTheDocument();
    expect(screen.getByText("address")).toBeInTheDocument();
    expect(screen.queryByText("着手处理")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "揭晓" }));
    expect(screen.getByText("着手处理")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "记得" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "忘了" })).toBeInTheDocument();

    // 最后一张忘记后仍可再次揭晓，且今日数量不增加
    await user.click(screen.getByRole("button", { name: "忘了" }));
    expect(await screen.findByRole("button", { name: "揭晓" })).toBeInTheDocument();
    expect(screen.getByText(/今日 1 张 · 待复习 1 张/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "揭晓" }));
    await user.click(screen.getByRole("button", { name: "记得" }));
    expect(await screen.findByText("本轮已完成")).toBeInTheDocument();

    // 重开同日窗口：最终记得后不再计入今日
    view.unmount();
    const reopened = createMockApi(storage);
    expect(await reopened.listDueWordFavorites(TODAY)).toEqual([]);
    expect(await reopened.listDueWordFavorites(addLocalDays(TODAY, 1))).toHaveLength(1);

    const secondUser = userEvent.setup();
    render(<App api={reopened} />);
    await screen.findAllByText("我的阅读");
    await openReview(secondUser);
    expect(await screen.findByText(/今日 0 张/)).toBeInTheDocument();
    expect(screen.getByText("今日没有到期词卡，已完成。")).toBeInTheDocument();
  });

  it("删除生词本条目后，今日数量与待复习队列同步减少", async () => {
    const { api, user } = await renderAppWithStorage();
    const article = await api.pasteArticle({
      title: "Deleted Favorite",
      text: "We need to address the problem before the meeting.",
    });
    const created = await api.addWordFavorite({
      word: "address",
      sentence: "We need to address the problem before the meeting.",
      articleId: article.id,
      paragraphStart: 0,
      paragraphEnd: 0,
      contextualMeaning: "着手处理",
      commonMeaning: "地址；演说",
      today: addLocalDays(TODAY, -1),
    });

    await openReview(user);
    expect(await screen.findByText(/今日 1 张 · 待复习 1 张/)).toBeInTheDocument();

    await api.removeWordFavorite(created.favorite.id);
    window.dispatchEvent(new Event("focus"));

    expect(await screen.findByText(/今日 0 张 · 待复习 0 张/)).toBeInTheDocument();
    expect(await screen.findByText("今日已完成")).toBeInTheDocument();
  });

  it("昨天已完成的挂载轮次跨日后重建，并加载今天到期的卡", async () => {
    const yesterday = "2026-11-20";
    const today = "2026-11-21";
    let currentDate = yesterday;
    const api = createMockApi(createMemoryStorage());
    const article = await api.pasteArticle({
      title: "Completed Yesterday",
      text: "A sentence containing address for review.",
    });
    await seedReviewWord(api, article.id, "address", addLocalDays(yesterday, -1));
    await seedReviewWord(api, article.id, "envelope", yesterday);
    const user = userEvent.setup();
    render(
      <ReviewPage
        api={api}
        getToday={() => currentDate}
        onOpenArticle={vi.fn()}
        notify={vi.fn()}
      />,
    );

    expect(await screen.findByText(/今日 1 张 · 待复习 1 张/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "揭晓" }));
    await user.click(screen.getByRole("button", { name: "记得" }));
    expect(await screen.findByText(/本轮记得 1 张/)).toBeInTheDocument();
    expect(screen.getByText("本轮已完成")).toBeInTheDocument();

    currentDate = today;
    window.dispatchEvent(new Event("focus"));
    expect(
      await screen.findByText("今日 1 张 · 待复习 1 张 · 本轮记得 0 张"),
    ).toBeInTheDocument();
    expect(screen.getByText("envelope")).toBeInTheDocument();
    expect(screen.queryByText("envelope 的语境义")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "揭晓" }));
    expect(screen.getByText("envelope 的语境义")).toBeInTheDocument();
  });

  it("昨天未完成的挂载轮次跨日后清空旧状态，并并入今天新到期的卡", async () => {
    const yesterday = "2026-11-20";
    const today = "2026-11-21";
    let currentDate = yesterday;
    const api = createMockApi(createMemoryStorage());
    const article = await api.pasteArticle({
      title: "Unfinished Yesterday",
      text: "A sentence containing address for review.",
    });
    await seedReviewWord(api, article.id, "address", addLocalDays(yesterday, -1));
    await seedReviewWord(api, article.id, "envelope", yesterday);
    const user = userEvent.setup();
    render(
      <ReviewPage
        api={api}
        getToday={() => currentDate}
        onOpenArticle={vi.fn()}
        notify={vi.fn()}
      />,
    );

    expect(await screen.findByText(/今日 1 张 · 待复习 1 张/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "揭晓" }));
    await user.click(screen.getByRole("button", { name: "忘了" }));
    await user.click(screen.getByRole("button", { name: "揭晓" }));
    expect(screen.getByText("address 的语境义")).toBeInTheDocument();

    currentDate = today;
    window.dispatchEvent(new Event("focus"));
    expect(
      await screen.findByText("今日 2 张 · 待复习 2 张 · 本轮记得 0 张"),
    ).toBeInTheDocument();
    expect(screen.getByText("address")).toBeInTheDocument();
    expect(screen.queryByText("address 的语境义")).not.toBeInTheDocument();
    expect(await api.listDueWordFavorites(today)).toHaveLength(2);
  });

  it("评分前发现跨午夜会先重载新日队列，不把旧卡评分记到昨天", async () => {
    const yesterday = "2026-11-20";
    const today = "2026-11-21";
    let currentDate = yesterday;
    const api = createMockApi(createMemoryStorage());
    const article = await api.pasteArticle({ title: "Midnight Rating", text: "Review source." });
    await seedReviewWord(api, article.id, "address", addLocalDays(yesterday, -1));
    await seedReviewWord(api, article.id, "envelope", yesterday);
    const record = vi.spyOn(api, "recordReviewEvent");
    const user = userEvent.setup();
    render(
      <ReviewPage
        api={api}
        getToday={() => currentDate}
        onOpenArticle={vi.fn()}
        notify={vi.fn()}
      />,
    );

    expect(await screen.findByText("address")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "揭晓" }));
    currentDate = today;
    await user.click(screen.getByRole("button", { name: "记得" }));

    expect(await screen.findByText("今日 2 张 · 待复习 2 张 · 本轮记得 0 张")).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "揭晓" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "揭晓" }));
    await user.click(screen.getByRole("button", { name: "记得" }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0][0].localDate).toBe(today);
  });

  it("刷新保留当前顺序并追加新到期卡，旧 A 加新 A、B 得到 A、B", async () => {
    const { api, user } = await renderAppWithStorage();
    const article = await api.pasteArticle({ title: "Merge Queue", text: "Review source." });
    await seedReviewWord(api, article.id, "address", addLocalDays(TODAY, -1));
    await openReview(user);
    expect(await screen.findByText("address")).toBeInTheDocument();

    await seedReviewWord(api, article.id, "envelope", addLocalDays(TODAY, -1));
    await user.click(screen.getByRole("button", { name: "刷新词语复习" }));
    expect(await screen.findByText(/今日 2 张 · 待复习 2 张/)).toBeInTheDocument();
    expect(screen.getByText("address")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "揭晓" }));
    await user.click(screen.getByRole("button", { name: "记得" }));
    expect(await screen.findByText("envelope")).toBeInTheDocument();
    expect(screen.getByText("今日 2 张 · 待复习 1 张 · 本轮记得 1 张")).toBeInTheDocument();
  });

  it("忘记后的本轮队列同时驱动待复习数、忘记次数和 AI 输入", async () => {
    const api = createMockApi(createMemoryStorage());
    const article = await api.pasteArticle({ title: "Shared Round State", text: "Review source." });
    await seedReviewWord(api, article.id, "address", addLocalDays(TODAY, -1));
    await seedReviewWord(api, article.id, "envelope", addLocalDays(TODAY, -1));
    const coach = {
      suggestFocus: vi.fn().mockRejectedValue(new Error("离线")),
    };
    const user = userEvent.setup();
    render(
      <ReviewPage
        api={api}
        coach={coach}
        onOpenArticle={vi.fn()}
        notify={vi.fn()}
      />,
    );
    expect(await screen.findByText("address")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "揭晓" }));
    await user.click(screen.getByRole("button", { name: "忘了" }));
    expect(await screen.findByText("envelope")).toBeInTheDocument();
    expect(screen.getByText("今日 2 张 · 待复习 2 张 · 本轮记得 0 张")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "生成提醒" }));
    await screen.findByText(/历史累计忘记 1 次/);
    expect(coach.suggestFocus).toHaveBeenCalledTimes(1);
    const roundCards = coach.suggestFocus.mock.calls[0][0];
    expect(roundCards.map((card: { word: string }) => card.word)).toEqual(["envelope", "address"]);
    expect(roundCards[1].forgottenCount).toBe(1);
    expect(roundCards[1].forgottenToday).toBe(true);
  });

  it("长难句窗口：先原文后揭晓，译文解析随收藏持久保存", async () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const { storage, api, user, view } = await renderAppWithStorage();
    const article = await api.pasteArticle({
      title: "Long Sentence Source",
      text: "Although the meeting started late, we still finished the work.",
    });
    await api.addLongSentenceFavorite({
      sourceText: "Although the meeting started late, we still finished the work.",
      translation: "尽管会议开始得晚，我们还是完成了工作。",
      analysis: ANALYSIS,
      articleId: article.id,
      paragraphStart: 0,
      paragraphEnd: 0,
    });

    await openReview(user);
    await user.click(screen.getByRole("tab", { name: "长难句复习" }));
    await screen.findByRole("heading", { name: "长难句复习" });
    expect(
      screen.getByText(
        "Although the meeting started late, we still finished the work.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("尽管会议开始得晚，我们还是完成了工作。"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "揭晓译文与解析" }));
    expect(
      screen.getByText("尽管会议开始得晚，我们还是完成了工作。"),
    ).toBeInTheDocument();
    expect(screen.getByText("We still finished the work.")).toBeInTheDocument();

    // 重新打开应用后仍能揭晓同一份快照
    view.unmount();
    const secondUser = userEvent.setup();
    render(<App api={createMockApi(storage)} />);
    await screen.findAllByText("我的阅读");
    await openReview(secondUser);
    await secondUser.click(screen.getByRole("tab", { name: "长难句复习" }));
    await screen.findByRole("heading", { name: "长难句复习" });
    await secondUser.click(screen.getByRole("button", { name: "揭晓译文与解析" }));
    expect(
      screen.getByText("尽管会议开始得晚，我们还是完成了工作。"),
    ).toBeInTheDocument();
    expect(screen.getByText("We still finished the work.")).toBeInTheDocument();

    await secondUser.click(screen.getByRole("button", { name: "回看原文" }));
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    });
    expect(scrollIntoView.mock.instances.at(-1)).toHaveAttribute("data-i", "0");
  });

  it("AI 提醒失败时仍显示到期量与历史忘记次数，并可继续揭晓复习", async () => {
    const storage = createMemoryStorage();
    const api = createMockApi(storage);
    const article = await api.pasteArticle({
      title: "Offline Review",
      text: "We need to address the problem before the meeting.",
    });
    await api.addWordFavorite({
      word: "address",
      sentence: "We need to address the problem before the meeting.",
      articleId: article.id,
      paragraphStart: 0,
      paragraphEnd: 0,
      contextualMeaning: "着手处理",
      commonMeaning: "地址；演说",
      today: addLocalDays(TODAY, -1),
    });
    const coach = {
      async suggestFocus() {
        throw new Error("网络不可用");
      },
    };
    const user = userEvent.setup();
    render(<App api={api} coach={coach} />);
    await screen.findAllByText("我的阅读");
    await openReview(user);

    await user.click(screen.getByRole("button", { name: "生成提醒" }));
    expect(await screen.findByText(/无法获取 AI 提醒：网络不可用/)).toBeInTheDocument();
    expect(screen.getByText(/今日到期 1 张，历史累计忘记 0 次/)).toBeInTheDocument();
    // 断网不影响揭晓与评分
    await user.click(screen.getByRole("button", { name: "揭晓" }));
    expect(screen.getByText("着手处理")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "记得" })).toBeInTheDocument();
  });

  it("长难句窗口不分组不排程，删除收藏后窗口刷新为空", async () => {
    const { api, user } = await renderAppWithStorage();
    const article = await api.pasteArticle({
      title: "Two Sentences",
      text: "First sentence to review.\n\nSecond sentence to review.",
    });
    await api.addLongSentenceFavorite({
      sourceText: "First sentence to review.",
      translation: "第一条译文",
      articleId: article.id,
      paragraphStart: 0,
      paragraphEnd: 0,
    });
    const second = await api.addLongSentenceFavorite({
      sourceText: "Second sentence to review.",
      translation: "第二条译文",
      articleId: article.id,
      paragraphStart: 1,
      paragraphEnd: 1,
    });

    await openReview(user);
    await user.click(screen.getByRole("tab", { name: "长难句复习" }));
    await screen.findByText("共 2 条 · 按需复习，不分组、不参与日期排程");
    expect(screen.getByText(/第 1 \/ 2 条/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "揭晓译文与解析" }));
    expect(screen.queryByRole("button", { name: "揭晓译文与解析" })).not.toBeInTheDocument();
    // 窗口没有评分按钮，也不写入复习事件
    expect(screen.queryByRole("button", { name: "记得" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "忘了" })).not.toBeInTheDocument();

    await api.removeLongSentenceFavorite(second.favorite.id);
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => {
      expect(screen.getByText("共 1 条 · 按需复习，不分组、不参与日期排程")).toBeInTheDocument();
    });
    expect(screen.getByText("First sentence to review.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "揭晓译文与解析" })).toBeInTheDocument();
    expect(screen.queryByText("第一条译文")).not.toBeInTheDocument();
  });
});