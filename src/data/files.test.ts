import { afterEach, describe, expect, it, vi } from "vitest";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { appFiles } from "./files";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readTextFile: vi.fn(), writeTextFile: vi.fn() }));

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  vi.clearAllMocks();
});

describe("Tauri 官方文件插件", () => {
  it("save 确认后用 writeTextFile 写 CSV，取消时不写文件", async () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    vi.mocked(save).mockResolvedValueOnce(null);
    expect(await appFiles.saveText("words.csv", "csv")).toBeNull();
    expect(writeTextFile).not.toHaveBeenCalled();

    vi.mocked(save).mockResolvedValueOnce("D:/chosen/words.csv");
    expect(await appFiles.saveText("words.csv", "\uFEFFcsv")).toBe("D:/chosen/words.csv");
    expect(save).toHaveBeenLastCalledWith({
      defaultPath: "words.csv",
      filters: [{ name: "CSV 文件", extensions: ["csv"] }],
    });
    expect(writeTextFile).toHaveBeenCalledWith("D:/chosen/words.csv", "\uFEFFcsv");
  });

  it("open 选择本地词表后用 readTextFile 读取", async () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    vi.mocked(open).mockResolvedValue("D:/lists/cet4.txt");
    vi.mocked(readTextFile).mockResolvedValue("address\n");
    expect(await appFiles.pickText(["txt", "csv"])).toEqual({
      name: "cet4.txt",
      content: "address\n",
    });
    expect(open).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [{ name: "文本文件", extensions: ["txt", "csv"] }],
    });
    expect(readTextFile).toHaveBeenCalledWith("D:/lists/cet4.txt");
  });
});
