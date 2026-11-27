import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { version } from "../../src-tauri/tauri.conf.json";
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

afterEach(() => vi.unstubAllGlobals());

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

  it("备份数据库并提示从桌面版检查更新", async () => {
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
    expect(screen.getAllByText(("当前版本 " + version)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "检查更新" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("请在阅间桌面版中检查更新"));
    expect(screen.getByRole("button", { name: "从 GitHub URL 导入" })).toBeInTheDocument();
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
    expect(await screen.findByText(/还没有词表/)).toBeInTheDocument();

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

  it("从 GitHub Raw URL 下载、解析并导入目标词表", async () => {
    const api = createMockApi(createMemoryStorage());
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      "rank,word,doc_freq,term_freq\n1,the,1,1\n2,Apple,1,1\n3,of,1,1\n4,banana,1,1\n1201,ignored,1,1\n",
      { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchImpl);
    const user = userEvent.setup();
    render(<SettingsPage api={api} notify={vi.fn()} onDataDeleted={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "从 GitHub URL 导入" }));
    expect(screen.getByLabelText("Raw URL")).toHaveValue("https://raw.githubusercontent.com/yiyisheh/CET4-vocabulary/main/output/high_freq_surface_df.csv");
    const name = screen.getByLabelText("目标词表名");
    await user.clear(name);
    await user.type(name, "我的四级在线词表");
    await user.click(screen.getByRole("button", { name: "下载并导入" }));

    expect(await screen.findByText("我的四级在线词表")).toBeInTheDocument();
    expect(screen.getByText("2 词")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect((await api.listWords()).find((list) => list.name === "我的四级在线词表")?.words)
      .toEqual(["apple", "banana"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("按供应商提供模型下拉选项，保存选中模型和密码框中的 Key", async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    render(<SettingsPage api={createMockApi(createMemoryStorage())} notify={notify} onDataDeleted={vi.fn()} />);

    const provider = await screen.findByLabelText("供应商");
    await user.selectOptions(provider, "deepseek");
    expect(screen.getByLabelText("Base URL")).toHaveValue("https://api.deepseek.com/v1");
    const model = screen.getByRole("combobox", { name: "模型" });
    expect(model).toHaveValue("deepseek-flash");
    await user.selectOptions(model, "deepseek-v4-pro");
    const key = screen.getByLabelText("API Key");
    expect(key).toHaveAttribute("type", "password");
    await user.type(key, "deepseek-test-key");
    await user.click(screen.getByRole("button", { name: "保存模型配置" }));
    expect(notify).toHaveBeenCalledWith("模型服务已保存：DeepSeek");
    expect(window.localStorage.getItem("yuejian.modelService")).not.toContain("deepseek-test-key");
    expect(JSON.parse(window.localStorage.getItem("yuejian.modelService")!).apiKey).toBeUndefined();
    expect(JSON.parse(window.localStorage.getItem("yuejian.modelService")!).model).toBe("deepseek-v4-pro");

    await user.selectOptions(provider, "qwen");
    expect(screen.getByLabelText("Base URL")).toHaveValue("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(model).toHaveValue("qwen-plus");
    expect(screen.getByRole("option", { name: "qwen-flash" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "deepseek-v4-pro" })).not.toBeInTheDocument();
    expect(key).toHaveValue("");
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
