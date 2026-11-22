import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { isTauriRuntime } from "./index";

export interface PickedTextFile {
  name: string;
  content: string;
}

export interface AppFileService {
  saveText(defaultPath: string, content: string): Promise<string | null>;
  backupDatabase(
    defaultPath: string,
    backup: (destination: string) => Promise<string>,
  ): Promise<string | null>;
  pickText(extensions?: string[]): Promise<PickedTextFile | null>;
}

function browserDownload(defaultPath: string, content: string): string {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = defaultPath;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return defaultPath;
}

function browserPick(extensions: string[]): Promise<PickedTextFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = extensions.map((extension) => `.${extension}`).join(",");
    input.style.display = "none";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        input.remove();
        resolve(null);
        return;
      }
      file.text().then(
        (content) => {
          input.remove();
          resolve({ name: file.name, content });
        },
        (cause) => {
          input.remove();
          reject(cause);
        },
      );
    });
    input.addEventListener("cancel", () => {
      input.remove();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

export const appFiles: AppFileService = {
  async saveText(defaultPath, content) {
    if (!isTauriRuntime()) return browserDownload(defaultPath, content);
    const destination = await save({
      defaultPath,
      filters: [{ name: "CSV 文件", extensions: ["csv"] }],
    });
    if (!destination) return null;
    await writeTextFile(destination, content);
    return destination;
  },

  async backupDatabase(defaultPath, backup) {
    if (!isTauriRuntime()) {
      throw new Error("浏览器预览没有 SQLite 数据库文件，请在桌面版中备份");
    }
    const destination = await save({
      defaultPath,
      filters: [{ name: "SQLite 数据库", extensions: ["db"] }],
    });
    if (!destination) return null;
    return backup(destination);
  },

  async pickText(extensions = ["txt", "csv"]) {
    if (!isTauriRuntime()) return browserPick(extensions);
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "文本文件", extensions }],
    });
    if (!selected || Array.isArray(selected)) return null;
    return {
      name: selected.split(/[\\/]/).pop() ?? selected,
      content: await readTextFile(selected),
    };
  },
};
