import { describe, expect, it } from "vitest";
import { createMemoryStorage, createMockApi } from "./mock";

describe("mock workspace API", () => {
  it("splits a three-paragraph paste into one card and the default section", async () => {
    const api = createMockApi(createMemoryStorage());
    const article = await api.pasteArticle({
      title: "  City Walking  ",
      text: "A city street is quiet.\n\nSecond paragraph changed later.\n\nThird paragraph.",
    });
    expect(article.title).toBe("City Walking");
    expect(article.paragraphs).toHaveLength(3);
    expect(article.sectionIds).toHaveLength(1);
    expect(article.topic).toBe("城市与生活");

    const sections = await api.listSections();
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe("我的阅读");
    expect(sections[0].articleCount).toBe(1);
    const list = await api.listSectionArticles(sections[0].id);
    expect(list.map((item) => item.id)).toEqual([article.id]);
  });

  it("rejects empty paste input", async () => {
    const api = createMockApi(createMemoryStorage());
    await expect(api.pasteArticle({ title: "", text: "Body." })).rejects.toThrow(
      "标题不能为空",
    );
    await expect(api.pasteArticle({ title: "Title", text: "\n\n  " })).rejects.toThrow(
      "正文不能为空",
    );
    expect(await api.listLibrary()).toEqual([]);
  });

  it("adds one article to two sections without duplicates and keeps the source on removal", async () => {
    const api = createMockApi(createMemoryStorage());
    const article = await api.pasteArticle({ title: "Title", text: "Body." });
    const second = await api.createSection("  本周精读 ");
    expect(second.name).toBe("本周精读");
    expect(await api.addArticlesToSection(second.id, [article.id, article.id])).toEqual({
      added: 1,
    });
    expect(await api.addArticlesToSection(second.id, [article.id])).toEqual({ added: 0 });
    expect((await api.getArticleSections(article.id)).map((s) => s.name)).toEqual([
      "我的阅读",
      "本周精读",
    ]);
    expect(await api.removeArticleFromSection(second.id, article.id)).toBe(true);
    expect(await api.listSectionArticles(second.id)).toEqual([]);
    expect(await api.listSectionArticles(article.sectionIds[0])).toHaveLength(1);
    expect((await api.getArticle(article.id)).title).toBe("Title");
  });

  it("bumps the version on edit and rejects a stale version", async () => {
    const api = createMockApi(createMemoryStorage());
    const created = await api.pasteArticle(
      { title: "Title", text: "One.\n\nTwo.\n\nThree." },
    );
    const updated = await api.updateArticle({
      id: created.id,
      title: "Renamed",
      topic: "教育与学习",
      paragraphs: ["One.", "Two changed.", "Three."],
      expectedVersion: 1,
    });
    expect(updated.version).toBe(2);
    expect(updated.paragraphs[1]).toBe("Two changed.");
    await expect(
      api.updateArticle({
        id: created.id,
        title: "Stale",
        topic: "未分类",
        paragraphs: ["Stale."],
        expectedVersion: 1,
      }),
    ).rejects.toThrow("正文已在其他位置更新");
  });

  it("persists to the provided storage across instances", async () => {
    const storage = createMemoryStorage();
    const first = createMockApi(storage);
    const created = await first.pasteArticle({
      title: "Persistent",
      text: "Original paragraph.",
    });
    await first.updateArticle({
      id: created.id,
      title: "Persistent",
      topic: "未分类",
      paragraphs: ["Edited paragraph."],
      expectedVersion: 1,
    });
    const second = createMockApi(storage);
    const reloaded = await second.getArticle(created.id);
    expect(reloaded.paragraphs).toEqual(["Edited paragraph."]);
    expect(reloaded.version).toBe(2);
    expect((await second.listSections())[0].articleCount).toBe(1);
  });
});