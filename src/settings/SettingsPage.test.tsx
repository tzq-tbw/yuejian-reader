import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "./SettingsPage";
import { createMemoryStorage, createMockApi } from "../data/mock";
import type { AppFileService } from "../data/files";
import { localDateKey } from "../review/schedule";

function fileService(overrides: Partial<AppFileService> = {}): AppFileService {
  return {
    saveText: vi.fn().mockResolvedValue("D:/exports/words.csv"),
    backupDatabase: vi.fn().mockResolvedValue("D:/backups/reader.db"),
    pickText: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("设置页", () => {
  it("通过文件服务导出三列生词 CSV，长难句不参与", async () => {
    const api = createMockApi(createMemoryStorage());
    const article = await api.pasteArticle({ title: "Source", text: "A brief summary." });
    await api.addWordFavorite({
      word: 'brief, "summary"',
      sentence: "A brief summary.",
      articleId: article.id,
      paragraphStart: 0,
      paragraphEnd: 0,
      contextualMeaning: "不应导出",
      commonMeaning: "简短, 概要；“摘要”",
      partOfSpeech: "n.",
      today: localDateKey(),
    });
    await api.addLongSentenceFavorite({
      sourceText: "LONG SENTENCE MUST NOT EXPORT",
      articleId: article.id,
      paragraphStart: 0,
      paragraphEnd: 0,
    });
    const files = fileService();
    const user = userEvent.setup();
    render(<SettingsPage api={api} files={files} notify={vi.fn()} onDataDeleted={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "选择位置并导出" }));
    await waitFor(() => expect(files.saveText).toHaveBeenCalled());
    const [name, csv] = vi.mocked(files.saveText).mock.calls[0];
    expect(name).toBe(`生词本-${localDateKey()}.csv`);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"单词","词性","基本意思"\r\n');
    expect(csv).toContain('"brief, ""summary""","n.","简短, 概要"');
    expect(csv).not.toContain("不应导出");
    expect(csv).not.toContain("LONG SENTENCE MUST NOT EXPORT");
    expect(screen.queryByRole("button", { name: "导出生词本" })).not.toBeInTheDocument();
  });

  it("备份数据库并显示版本与更新占位", async () => {
    const api = createMockApi(createMemoryStorage());
    const backup = vi.spyOn(api, "backupDatabase");
    const files = fileService({
      backupDatabase: vi.fn((_name, action) => action("D:/backups/reader.db")),
    });
    const notify = vi.fn();
    const user = userEvent.setup();
    render(<SettingsPage api={api} files={files} notify={notify} onDataDeleted={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "备份数据库" }));
    expect(backup).toHaveBeenCalledWith("D:/backups/reader.db");
    expect(screen.getAllByText(/当前版本 0\.1\.0/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "检查更新" }));
    expect(notify).toHaveBeenCalledWith("当前版本 0.1.0；自动检查更新将在阶段 5 接入");
    await user.click(screen.getByRole("button", { name: "从 GitHub URL 导入（即将支持）" }));
    expect(notify).toHaveBeenCalledWith("GitHub 在线导入将在后续版本接入；当前请先下载 TXT 或 CSV 后导入");
  });

  it("本地导入词表、展示来源词数并可删除", async () => {
    const api = createMockApi(createMemoryStorage());
    const files = fileService({
      pickText: vi.fn().mockResolvedValue({
        name: "extra.csv",
        content: "word,meaning\nApple,苹果\nbanana,香蕉\napple,重复\n",
      }),
    });
    const user = userEvent.setup();
    render(<SettingsPage api={api} files={files} notify={vi.fn()} onDataDeleted={vi.fn()} />);
    expect(await screen.findByText("四级高频")).toBeInTheDocument();
    expect(screen.getByText("六级高频")).toBeInTheDocument();
    expect(screen.getByText("考研高频")).toBeInTheDocument();
    expect(screen.getAllByText("1,600 词")).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "从本地 TXT / CSV 导入" }));
    const name = await screen.findByLabelText("词表名称");
    expect(name).toHaveValue("extra");
    await user.clear(name);
    await user.type(name, "高频补充");
    await user.click(screen.getByRole("button", { name: "导入" }));
    expect(await screen.findByText("高频补充")).toBeInTheDocument();
    expect(screen.getByText("2 词")).toBeInTheDocument();
    expect(screen.getByText("extra.csv")).toBeInTheDocument();
    expect((await api.listWords()).find((list) => list.name === "高频补充")?.words)
      .toEqual(["apple", "banana"]);

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "删除词表 高频补充" }));
    await waitFor(() => expect(screen.queryByText("高频补充")).not.toBeInTheDocument());
  });

  it("两次确认后清空全部业务数据", async () => {
    const api = createMockApi(createMemoryStorage());
    await api.pasteArticle({ title: "Delete me", text: "Body." });
    const onDataDeleted = vi.fn();
    const user = userEvent.setup();
    render(<SettingsPage api={api} notify={vi.fn()} onDataDeleted={onDataDeleted} />);

    await user.click(await screen.findByRole("button", { name: "清空所有数据" }));
    expect(screen.getByRole("dialog", { name: "确认清空所有数据？" })).toBeInTheDocument();
    expect(await api.listLibrary()).not.toEqual([]);
    await user.click(screen.getByRole("button", { name: "继续" }));
    expect(screen.getByRole("dialog", { name: "最后确认" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "永久删除全部数据" }));

    await waitFor(() => expect(onDataDeleted).toHaveBeenCalledTimes(1));
    expect(await api.listLibrary()).toEqual([]);
    expect(await api.listSections()).toEqual([]);
    expect(await api.listWordlists()).toEqual([]);
    expect(await api.listWordFavorites(localDateKey())).toEqual([]);
  });
});
