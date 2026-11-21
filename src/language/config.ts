import type { ModelConfig } from "./types";

/**
 * 默认经本机 Magpie 代理访问 DeepSeek。
 * 供应商层保持可替换：baseUrl 和 model 可用参数或 VITE_* 环境变量覆盖。
 * 阶段 3 不实现系统凭据存储，apiKey 只是调用方构造参数占位。
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = Object.freeze({
  baseUrl: "http://127.0.0.1:3425/v1",
  model: "auto/deepseek-v4.1-flash",
  apiKey: "",
  temperature: 0.2,
  timeoutMs: 90_000,
});

type EnvRecord = Record<string, string | undefined>;

function envValue(name: string): string | undefined {
  const env = (import.meta as ImportMeta & { env?: EnvRecord }).env;
  return env?.[name]?.trim() || undefined;
}

export function resolveModelConfig(
  overrides: Partial<ModelConfig> = {},
): ModelConfig {
  return {
    baseUrl:
      overrides.baseUrl ?? envValue("VITE_LANGUAGE_BASE_URL") ?? DEFAULT_MODEL_CONFIG.baseUrl,
    model:
      overrides.model ?? envValue("VITE_LANGUAGE_MODEL") ?? DEFAULT_MODEL_CONFIG.model,
    apiKey: overrides.apiKey ?? DEFAULT_MODEL_CONFIG.apiKey,
    temperature:
      overrides.temperature ?? DEFAULT_MODEL_CONFIG.temperature,
    timeoutMs: overrides.timeoutMs ?? DEFAULT_MODEL_CONFIG.timeoutMs,
  };
}

/** 拼接 OpenAI 兼容路径，容忍 baseUrl 末尾多余的斜杠。 */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}