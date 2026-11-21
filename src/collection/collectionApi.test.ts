import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStorage, createMockApi } from "../data/mock";
import type { AddWordFavoriteInput } from "../data/types";
import { addLocalDays, localDateKey } from "../review/schedule";

const TODAY = localDateKey();

async function seedArticle(
  api = createMockApi(createMemoryStorage()),
): Promise<ReturnType<typeof createMockApi>> {
  await api.pasteArticle({
    title: "Collection Source",
    text: "We need to address the problem before the meeting.\n\nPlease write your address on the envelope.",
  });
  return api;
}

async function articleId(api: ReturnType<typeof createMockApi>): Promise<number> {
  const sections = await api.listSections();
  const articles = await api.listSectionArticles(sections[0].id);
  return articles[0].id;
}

function wordInput(
  articleIdValue: number,
  overrides: Partial<AddWordFavoriteInput> = {},
): AddWordFavoriteInput {
  return {
    word: "address",
    sentence: "We need to address the problem before the meeting.",
    articleId: articleIdValue,
    paragraphStart: 0,
    paragraphEnd: 0,
    contextualMeaning: "着手处理",
    commonMeaning: "地址；演说",
    phonetic: "/əˈdres/",
    partOfSpeech: "v.",
    forms: ["过去式: addressed"],
    today: TODAY,
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("生词本持久化", () => {
  it("同词同句忽略大小写与空白只留一条，换原句可新增", async () => {
    const api = await seedArticle();
    const id = await articleId(api);
    const first = await api.addWordFavorite(wordInput(id));
    expect(first.created).toBe(true);

    const repeated = await api.addWordFavorite(
      wordInput(id, {
        word: "  ADDRESS ",
        sentence:
          "we  need\nto address the problem before the meeting.",
        contextualMeaning: "不应覆盖旧快照",
      }),
    );
    expect(repeated.created).toBe(false);
    expect(repeated.favorite.id).toBe(first.favorite.id);
    expect(repeated.favorite.contextualMeaning).toBe("着手处理");
    expect(repeated.favorite.normalizedWord).toBe("address");
    expect(repeated.favorite.normalizedSentence).toBe(
      "we need to address the problem before the meeting.",
    );

    const second = await api.addWordFavorite(
      wordInput(id, {
        sentence: "Please write your address on the envelope.",
      }),
    );
    expect(second.created).toBe(true);
    expect(second.favorite.id).not.toBe(first.favorite.id);
    expect(await api.listWordFavorites(TODAY)).toHaveLength(2);
  });

  it("收藏次日首测，修改文章不覆盖原句与来源快照", async () => {
    const api = await seedArticle();
    const id = await articleId(api);
    const created = await api.addWordFavorite(wordInput(id));
    expect(created.favorite.dueDate).toBe(addLocalDays(TODAY, 1));
    expect(created.favorite.stage).toBe(0);

    await api.updateArticle({
      id,
      title: "Edited Title",
      topic: "教育与学习",
      paragraphs: ["Edited body without the old sentence."],
      expectedVersion: 1,
    });
    const listed = await api.listWordFavorites(TODAY);
    expect(listed[0].sentence).toBe(
      "We need to address the problem before the meeting.",
    );
    expect(listed[0].articleTitle).toBe("Collection Source");

    const again = await api.addWordFavorite(wordInput(id));
    expect(again.created).toBe(false);
    expect(again.favorite.sentence).toBe(
      "We need to address the problem before the meeting.",
    );
  });

  it("逐条移除后，排程与活动队列一并消失", async () => {
    const api = await seedArticle();
    const id = await articleId(api);
    const created = await api.addWordFavorite(wordInput(id));
    const tomorrow = addLocalDays(TODAY, 1);
    expect(await api.listDueWordFavorites(tomorrow)).toHaveLength(1);

    expect(await api.removeWordFavorite(created.favorite.id)).toBe(true);
    expect(await api.listWordFavorites(TODAY)).toEqual([]);
    expect(await api.listDueWordFavorites(tomorrow)).toEqual([]);
    await expect(
      api.recordReviewEvent({
        favoriteId: created.favorite.id,
        roundId: "round",
        revealId: "reveal",
        rating: "remembered",
        localDate: tomorrow,
      }),
    ).rejects.toThrow("找不到这条词语收藏");
  });
});

describe("长难句本持久化", () => {
  it("同一处复用已有记录，缺项可补全，移除后不再出现", async () => {
    const api = await seedArticle();
    const id = await articleId(api);
    const input = {
      sourceText: "We need to address the problem before the meeting.",
      articleId: id,
      paragraphStart: 0,
      paragraphEnd: 0,
    };
    const created = await api.addLongSentenceFavorite(input);
    expect(created.created).toBe(true);
    expect(created.favorite.translation).toBeNull();
    expect(created.favorite.analysis).toBeNull();

    const repeated = await api.addLongSentenceFavorite({
      ...input,
      sourceText: "we need to address the problem before the meeting.",
      translation: "不应覆盖",
    });
    expect(repeated.created).toBe(false);
    expect(repeated.favorite.id).toBe(created.favorite.id);
    expect(repeated.favorite.translation).toBeNull();

    await expect(
      api.fillLongSentenceFavorite({
        id: created.favorite.id,
        analysis: "不是 JSON",
      }),
    ).rejects.toThrow("解析内容格式不合法");

    const filled = await api.fillLongSentenceFavorite({
      id: created.favorite.id,
      translation: "我们需要在会前处理这个问题。",
      analysis:
        '{"trunk":"We need...","clauses":[],"modifiers":[],"collocations":[]}',
    });
    expect(filled.translation).toBe("我们需要在会前处理这个问题。");
    expect(filled.analysis).toContain("We need");
    const reloaded = await api.listLongSentenceFavorites();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].analysis).toContain("We need");

    const unchanged = await api.fillLongSentenceFavorite({
      id: created.favorite.id,
      translation: "传入的新译文不应覆盖",
      analysis:
        '{"trunk":"New analysis must not overwrite","clauses":[],"modifiers":[],"collocations":[]}',
    });
    expect(unchanged.translation).toBe("我们需要在会前处理这个问题。");
    expect(unchanged.analysis).toContain("We need");
    expect(unchanged.analysis).not.toContain("New analysis");

    expect(await api.removeLongSentenceFavorite(created.favorite.id)).toBe(true);
    expect(await api.listLongSentenceFavorites()).toEqual([]);
  });

  it("换一处选区可独立收藏", async () => {
    const api = await seedArticle();
    const id = await articleId(api);
    await api.addLongSentenceFavorite({
      sourceText: "We need to address the problem before the meeting.",
      articleId: id,
      paragraphStart: 0,
      paragraphEnd: 0,
    });
    const second = await api.addLongSentenceFavorite({
      sourceText: "Please write your address on the envelope.",
      articleId: id,
      paragraphStart: 1,
      paragraphEnd: 1,
    });
    expect(second.created).toBe(true);
    expect(await api.listLongSentenceFavorites()).toHaveLength(2);
  });
});