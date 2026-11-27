import { describe, expect, it } from "vitest";
import { createFetchTransport } from "./transport";
import { DEFAULT_MODEL_CONFIG } from "./config";

describe("浏览器模型传输", () => {
  it.each(["", "local-test-value"])("空 Key 省略请求头，有 Key 发送 Bearer", async (apiKey) => {
    const transport = createFetchTransport({ ...DEFAULT_MODEL_CONFIG, apiKey }, async (_url, init) => {
      expect(new Headers(init?.headers).get("authorization")).toBe(apiKey ? `Bearer ${apiKey}` : null);
      return new Response('{"fixture":true}');
    });
    await expect(transport.chat({ messages: [] })).resolves.toEqual({ fixture: true });
  });

  it("截断过长的 HTTP 错误摘要", async () => {
    const transport = createFetchTransport(DEFAULT_MODEL_CONFIG, async () =>
      new Response("x".repeat(350), { status: 429 }));
    await expect(transport.chat({ messages: [] })).rejects.toThrow(`429：${"x".repeat(300)}…`);
  });

  it("DeepSeek 直连关闭默认思考，给词卡输出留足空间", async () => {
    const transport = createFetchTransport({
      ...DEFAULT_MODEL_CONFIG,
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-flash",
    }, async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.thinking).toEqual({ type: "disabled" });
      return new Response('{"fixture":true}');
    });
    await expect(transport.chat({ messages: [] })).resolves.toEqual({ fixture: true });
  });

  it("区分无效 JSON 与连接错误", async () => {
    const invalid = createFetchTransport(DEFAULT_MODEL_CONFIG, async () => new Response("<html>"));
    await expect(invalid.chat({ messages: [] })).rejects.toThrow("不是有效 JSON");
    const offline = createFetchTransport(DEFAULT_MODEL_CONFIG, async () => { throw new TypeError("Failed to fetch"); });
    await expect(offline.chat({ messages: [] })).rejects.toThrow("无法连接模型服务");
  });

  it("定时器中止请求后给出重试提示", async () => {
    const transport = createFetchTransport({ ...DEFAULT_MODEL_CONFIG, timeoutMs: 10 }, (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      }));
    await expect(transport.chat({ messages: [] })).rejects.toThrow("模型请求超时");
  });
});
