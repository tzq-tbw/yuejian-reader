import type { ModelConfig } from "./types";

export const DEFAULT_MODEL_CONFIG: ModelConfig = Object.freeze({
  baseUrl: "http://127.0.0.1:3425/v1",
  model: "auto/deepseek-v4.1-flash",
  apiKey: "",
  temperature: 0.2,
  timeoutMs: 90_000,
});

export type ModelProvider = "magpie" | "deepseek" | "qwen";

export interface StoredModelService extends ModelConfig {
  provider: ModelProvider;
}

export const MODEL_SERVICE_STORAGE_KEY = "yuejian.modelService";

export const MODEL_PROVIDER_PRESETS: Record<ModelProvider, {
  label: string;
  baseUrl: string;
  model: string;
}> = {
  magpie: {
    label: "默认 Magpie 代理",
    baseUrl: DEFAULT_MODEL_CONFIG.baseUrl,
    model: DEFAULT_MODEL_CONFIG.model,
  },
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  qwen: {
    label: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
  },
};

type EnvRecord = Record<string, string | undefined>;

function envValue(name: string): string | undefined {
  const env = (import.meta as ImportMeta & { env?: EnvRecord }).env;
  return env?.[name]?.trim() || undefined;
}

export function readStoredModelService(): StoredModelService | null {
  try {
    const raw = window.localStorage.getItem(MODEL_SERVICE_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredModelService>;
    if (
      !value.provider || !(value.provider in MODEL_PROVIDER_PRESETS) ||
      typeof value.baseUrl !== "string" || !value.baseUrl.trim() ||
      typeof value.model !== "string" || !value.model.trim() ||
      typeof value.apiKey !== "string"
    ) return null;
    return {
      provider: value.provider,
      baseUrl: value.baseUrl,
      model: value.model,
      apiKey: value.apiKey,
      temperature: typeof value.temperature === "number" ? value.temperature : DEFAULT_MODEL_CONFIG.temperature,
      timeoutMs: typeof value.timeoutMs === "number" ? value.timeoutMs : DEFAULT_MODEL_CONFIG.timeoutMs,
    };
  } catch {
    return null;
  }
}

export function saveStoredModelService(config: StoredModelService): void {
  const normalized: StoredModelService = {
    ...config,
    baseUrl: config.baseUrl.trim(),
    model: config.model.trim(),
    apiKey: config.apiKey.trim(),
  };
  window.localStorage.setItem(MODEL_SERVICE_STORAGE_KEY, JSON.stringify(normalized));
}

export function resolveModelConfig(
  overrides: Partial<ModelConfig> = {},
): ModelConfig {
  const stored = readStoredModelService();
  return {
    baseUrl:
      overrides.baseUrl ?? stored?.baseUrl ?? envValue("VITE_LANGUAGE_BASE_URL") ?? DEFAULT_MODEL_CONFIG.baseUrl,
    model:
      overrides.model ?? stored?.model ?? envValue("VITE_LANGUAGE_MODEL") ?? DEFAULT_MODEL_CONFIG.model,
    apiKey: overrides.apiKey ?? stored?.apiKey ?? DEFAULT_MODEL_CONFIG.apiKey,
    temperature:
      overrides.temperature ?? stored?.temperature ?? DEFAULT_MODEL_CONFIG.temperature,
    timeoutMs: overrides.timeoutMs ?? stored?.timeoutMs ?? DEFAULT_MODEL_CONFIG.timeoutMs,
  };
}

/** 拼接 OpenAI 兼容路径，容忍 baseUrl 末尾多余的斜杠。 */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
