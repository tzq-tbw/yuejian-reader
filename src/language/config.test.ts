import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MODEL_CONFIG,
  resolveModelConfig,
  saveStoredModelService,
  type ModelProvider,
} from "./config";
import { createFetchTransport } from "./transport";

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

beforeEach(() => window.localStorage.clear());
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
});
