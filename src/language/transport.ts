import { invoke } from "@tauri-apps/api/core";
import type { ChatTransport, ModelConfig } from "./types";
import { DEFAULT_MODEL_CONFIG, joinUrl } from "./config";

function excerpt(text: string, limit = 300): string {
  const trimmed = text.trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed;
}

/** 浏览器预览通道；桌面端默认走 Rust 命令，避免 WebView 的 CORS 限制。 */
export function createFetchTransport(
  config: ModelConfig = DEFAULT_MODEL_CONFIG,
  fetchImpl: typeof fetch = fetch,
): ChatTransport {
  return {
    async chat(call) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const response = await fetchImpl(joinUrl(config.baseUrl, "chat/completions"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.apiKey
              ? { Authorization: `Bearer ${config.apiKey}` }
              : {}),
          },
          body: JSON.stringify({
            model: config.model,
            messages: call.messages,
            temperature: call.temperature ?? config.temperature,
            ...(call.maxTokens ? { max_tokens: call.maxTokens } : {}),
            stream: false,
          }),
          signal: controller.signal,
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`模型服务返回 ${response.status}：${excerpt(text)}`);
        }
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new Error("模型服务返回的内容不是有效 JSON");
        }
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") {
          throw new Error(
            `模型请求超时（${Math.round(config.timeoutMs / 1000)} 秒），请重试`,
          );
        }
        if (cause instanceof TypeError && cause.message.toLowerCase().includes("fetch")) {
          throw new Error(
            `无法连接模型服务 ${config.baseUrl}，请确认 Magpie 代理已启动`,
          );
        }
        throw cause;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** 桌面端通道：由 Rust 发出 HTTP 请求，密钥不进入前端存储。 */
export function createTauriTransport(
  config: ModelConfig = DEFAULT_MODEL_CONFIG,
): ChatTransport {
  return {
    async chat(call) {
      return invoke<unknown>("model_chat", {
        input: {
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
          messages: call.messages,
          temperature: call.temperature ?? config.temperature,
          maxTokens: call.maxTokens ?? null,
          timeoutMs: config.timeoutMs,
        },
      });
    },
  };
}

export function createDefaultTransport(
  config: ModelConfig = DEFAULT_MODEL_CONFIG,
): ChatTransport {
  const inTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  return inTauri
    ? createTauriTransport(config)
    : createFetchTransport(config);
}