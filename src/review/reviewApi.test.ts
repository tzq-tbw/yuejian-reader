import { describe, expect, it } from "vitest";
import { createMemoryStorage, createMockApi } from "../data/mock";
import type { ReviewEventInput } from "../data/types";
import { addLocalDays, localDateKey } from "./schedule";

function event(
  favoriteId: number,
  reveal: string,
  rating: ReviewEventInput["rating"],
  localDate: string,
): ReviewEventInput {
  return {
    favoriteId,
    roundId: "round-1",
    revealId: `round-1:${favoriteId}:${reveal}`,
    rating,
    localDate,
  };
}

async function seedWord(
  api: ReturnType<typeof createMockApi>,
  today: string,
): Promise<number> {
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
    today,
  });
  return created.favorite.id;
}

describe("词语复习窗口数据", () => {
  const today = localDateKey();
  const tomorrow = addLocalDays(today, 1);

  it("到期与逾期合并，收藏次日才出现", async () => {
    const api = createMockApi(createMemoryStorage());
    await seedWord(api, today);
    expect(await api.listDueWordFavorites(today)).toEqual([]);
    const due = await api.listDueWordFavorites(tomorrow);
    expect(due).toHaveLength(1);
    expect(due[0].word).toBe("address");
    expect(due[0].dueDate).toBe(tomorrow);

    // 逾期仍到期
    const overdue = await api.listDueWordFavorites(addLocalDays(today, 5));
    expect(overdue).toHaveLength(1);
  });

  it("忘记者留在今日队列，最终记得后当日不再计入，次日再测", async () => {
    const api = createMockApi(createMemoryStorage());
    const id = await seedWord(api, addLocalDays(today, -1)); // 今日到期
    expect(await api.listDueWordFavorites(today)).toHaveLength(1);

    const forgotten = await api.recordReviewEvent(event(id, "1", "forgotten", today));
    expect(forgotten).toMatchObject({ stage: 0, dueDate: tomorrow, recorded: true });
    // 今日数量按卡去重：忘记后同日再出现不增加总量
    const sameDay = await api.listDueWordFavorites(today);
    expect(sameDay).toHaveLength(1);
    expect(sameDay[0].forgottenToday).toBe(true);
    expect(sameDay[0].forgottenCount).toBe(1);

    const remembered = await api.recordReviewEvent(event(id, "2", "remembered", today));
    expect(remembered).toMatchObject({ stage: 0, dueDate: tomorrow, recorded: true });
    // 最终记得后同日不再出现；历史忘记次数保留
    expect(await api.listDueWordFavorites(today)).toEqual([]);
    const nextDay = await api.listDueWordFavorites(tomorrow);
    expect(nextDay[0].forgottenCount).toBe(1);
  });

  it("重复点击同一次揭晓只记一次，排程不被二次推进", async () => {
    const api = createMockApi(createMemoryStorage());
    const id = await seedWord(api, addLocalDays(today, -1));
    const first = await api.recordReviewEvent(event(id, "1", "remembered", today));
    expect(first.dueDate).toBe(addLocalDays(today, 2));
    const second = await api.recordReviewEvent(event(id, "1", "remembered", today));
    expect(second.recorded).toBe(false);
    expect(second.stage).toBe(first.stage);
    expect(second.dueDate).toBe(first.dueDate);
  });

  it("评分与排程持久化到同一存储，重开窗口读取新状态", async () => {
    const storage = createMemoryStorage();
    const api = createMockApi(storage);
    const id = await seedWord(api, addLocalDays(today, -1));
    await api.recordReviewEvent(event(id, "1", "remembered", today));

    const reopened = createMockApi(storage);
    expect(await reopened.listDueWordFavorites(today)).toEqual([]);
    expect(await reopened.listDueWordFavorites(addLocalDays(today, 2))).toHaveLength(1);
  });

  it("删除收藏同步移出活动队列", async () => {
    const storage = createMemoryStorage();
    const api = createMockApi(storage);
    const id = await seedWord(api, addLocalDays(today, -1));
    expect(await api.listDueWordFavorites(today)).toHaveLength(1);
    await api.removeWordFavorite(id);
    expect(await api.listDueWordFavorites(today)).toEqual([]);
    const reopened = createMockApi(storage);
    expect(await reopened.listDueWordFavorites(today)).toEqual([]);
  });
});