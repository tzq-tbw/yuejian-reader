import { describe, expect, it } from "vitest";
import { createMemoryStorage, createMockApi } from "./mock";
import type { ImportSuiteInput } from "./types";

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

  function importInput(): ImportSuiteInput {
    return {
      title: "2026年6月大学英语四级真题（第1套）",
      fingerprint: "sample-fingerprint",
      examLevel: "四级",
      articles: [1, 2, 3, 4].map((sequenceNo) => ({
        title: `阅读文章 ${sequenceNo}`,
        examType: sequenceNo <= 2 ? "选词填空" : "仔细阅读",
        sequenceNo,
        pageRange: `${sequenceNo}–${sequenceNo + 1}`,
        questionRange: `${25 + sequenceNo * 5}–${29 + sequenceNo * 5}`,
        questionArea: JSON.stringify({ kind: "multiple_choice", questions: [] }),
        paragraphs: [`Passage ${sequenceNo} has enough English text for reading practice.`],
      })),
    };
  }

  it("imports a suite once, groups the library and keeps metadata", async () => {
    const storage = createMemoryStorage();
    const api = createMockApi(storage);
    const created = await api.importSuite(importInput());
    expect(created.created).toBe(true);
    expect(created.articles).toHaveLength(4);
    expect(created.articles.map((article) => article.sequenceNo)).toEqual([1, 2, 3, 4]);
    expect(created.articles[0].pageRange).toBe("1–2");
    expect(created.articles[0].questionRange).toBe("30–34");

    const groups = await api.listLibrary();
    expect(groups).toHaveLength(1);
    expect(groups[0].suiteId).toBe(created.suiteId);
    expect(groups[0].title).toBe("2026年6月大学英语四级真题（第1套）");
    expect(groups[0].source).toBe("pdf");
    expect(groups[0].articles.map((article) => article.title)).toEqual([
      "阅读文章 1",
      "阅读文章 2",
      "阅读文章 3",
      "阅读文章 4",
    ]);
    const defaultSection = (await api.listSections())[0];
    expect(defaultSection.articleCount).toBe(4);

    const detail = await api.getArticle(created.articles[0].id);
    expect(detail.questionArea).toContain("multiple_choice");

    const again = await api.importSuite(importInput());
    expect(again.created).toBe(false);
    expect(again.articles.map((article) => article.id)).toEqual(
      created.articles.map((article) => article.id),
    );
    expect((await api.listSections())[0].articleCount).toBe(4);
  });

  it("rejects an invalid article before writing any card", async () => {
    const api = createMockApi(createMemoryStorage());
    const input = importInput();
    input.articles[0].paragraphs = ["   "];
    await expect(api.importSuite(input)).rejects.toThrow("正文为空");
    expect(await api.listLibrary()).toEqual([]);
  });

  it("restores in-memory state when persistence fails", async () => {
    const inner = createMemoryStorage();
    let fail = true;
    const storage = {
      getItem: inner.getItem,
      removeItem: inner.removeItem,
      setItem: (key: string, value: string) => {
        if (fail) throw new Error("磁盘已满");
        inner.setItem(key, value);
      },
    };
    const api = createMockApi(storage);
    await expect(api.importSuite(importInput())).rejects.toThrow("磁盘已满");
    fail = false;
    expect(await api.listLibrary()).toEqual([]);
    expect((await api.listSections())[0].articleCount).toBe(0);
  });
});