import { createMockApi } from "./mock";
import { tauriApi } from "./tauriApi";
import type { ReaderApi } from "./types";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let cached: ReaderApi | null = null;

/** 桌面端用 Tauri 命令；普通浏览器中退回 localStorage 样例库，便于预览与测试。 */
export function getApi(): ReaderApi {
  if (!cached) cached = isTauriRuntime() ? tauriApi : createMockApi(window.localStorage);
  return cached;
}

export type { ReaderApi } from "./types";