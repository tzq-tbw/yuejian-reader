import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_MODEL_CONFIG,
  resolveModelConfig,
  loadModelApiKey,
  loadModelConfig,
  persistModelService,
  saveStoredModelService,
  type ModelProvider,
} from "./config";
import { createFetchTransport } from "./transport";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

function saveProvider(provider: ModelProvider, apiKey: string) {
  const direct = provider === "deepseek"
    ? { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" }
    : { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" };
  saveStoredModelService({
    provider,
    ...direct,
    apiKey,
    temperature: DEFAULT_MODEL_CONFIG.temperature,
    timeoutMs: DEFAULT_MODEL_CONFIG.timeoutMs,
  });
}

beforeEach(() => {
  saveStoredModelService({ provider: "magpie", ...DEFAULT_MODEL_CONFIG });
  window.localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("自定义模型服务配置", () => {
  it("本地配置覆盖默认 Magpie，显式参数仍拥有最高优先级", () => {
    expect(resolveModelConfig().baseUrl).toBe(DEFAULT_MODEL_CONFIG.baseUrl);
    saveProvider("qwen", "qwen-secret");
    expect(resolveModelConfig()).toMatchObject({
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "qwen-plus",
      apiKey: "qwen-secret",
    });
    expect(resolveModelConfig({ model: "custom-model", apiKey: "override" })).toMatchObject({
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "custom-model",
      apiKey: "override",
    });
  });

  it("transport 每次请求重读配置并发送对应 URL、model 和 Bearer Key", async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", { status: 200 })));
    const transport = createFetchTransport(() => resolveModelConfig(), fetchImpl);
    saveProvider("qwen", "qwen-secret");
    await transport.chat({ messages: [{ role: "user", content: "first" }] });
    saveProvider("deepseek", "deepseek-secret");
    await transport.chat({ messages: [{ role: "user", content: "second" }] });

    expect(fetchImpl.mock.calls[0][0]).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({ Authorization: "Bearer qwen-secret" });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).model).toBe("qwen-plus");
    expect(fetchImpl.mock.calls[1][0]).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(fetchImpl.mock.calls[1][1].headers).toMatchObject({ Authorization: "Bearer deepseek-secret" });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).model).toBe("deepseek-chat");
  });

  it("桌面端 Key 经 Tauri 保存和读取，localStorage 只含非敏感配置", async () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "get_model_api_key") return Promise.resolve("desktop-secret");
      return Promise.resolve(undefined);
    });
    await persistModelService({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      apiKey: "desktop-secret",
      temperature: DEFAULT_MODEL_CONFIG.temperature,
      timeoutMs: DEFAULT_MODEL_CONFIG.timeoutMs,
    });

    expect(invoke).toHaveBeenCalledWith("save_model_api_key", { apiKey: "desktop-secret" });
    const stored = window.localStorage.getItem("yuejian.modelService")!;
    expect(stored).not.toContain("desktop-secret");
    expect(JSON.parse(stored).apiKey).toBeUndefined();
    expect((await loadModelConfig()).apiKey).toBe("desktop-secret");
  });

  it("桌面端首次读取迁移旧 localStorage Key 并移除明文", async () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    window.localStorage.setItem("yuejian.modelService", JSON.stringify({
      provider: "qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "qwen-plus",
      apiKey: "legacy-secret",
    }));
    vi.mocked(invoke).mockResolvedValue("");

    expect(await loadModelApiKey()).toBe("legacy-secret");
    expect(invoke).toHaveBeenCalledWith("save_model_api_key", { apiKey: "legacy-secret" });
    expect(window.localStorage.getItem("yuejian.modelService")).not.toContain("legacy-secret");
    await loadModelApiKey();
    expect(invoke).toHaveBeenCalledWith("get_model_api_key");
  });
});
