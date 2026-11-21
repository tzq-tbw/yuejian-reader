import type {
  ChatMessage,
  LanguageService,
  ModelConfig,
  TextRequestInput,
  ChatTransport,
  WordRequestInput,
} from "./types";
import { resolveModelConfig } from "./config";
import { createDefaultTransport } from "./transport";
import {
  buildAnalysisMessages,
  buildTranslationMessages,
  buildWordCardMessages,
} from "./prompts";
import {
  extractChatContent,
  parseAnalysisResponse,
  parseTranslationResponse,
  parseWordCardResponse,
} from "./parse";

interface ServiceOptions {
  transport?: ChatTransport;
  config?: Partial<ModelConfig>;
}

function translationMode(input: TextRequestInput): "selection" | "paragraph" {
  return input.target.operation === "paragraph" ? "paragraph" : "selection";
}

/**
 * 语言服务：提示词 → 传输层 → 响应解析。
 * 传输层可替换，单元测试和组件测试注入可控延迟桩。
 */
export function createLanguageService(options: ServiceOptions = {}): LanguageService {
  const config = resolveModelConfig(options.config);
  const transport = options.transport ?? createDefaultTransport(config);

  async function complete(messages: ChatMessage[], maxTokens: number): Promise<string> {
    const raw = await transport.chat({
      messages,
      temperature: config.temperature,
      maxTokens,
    });
    return extractChatContent(raw);
  }

  return {
    async wordCard(input: WordRequestInput) {
      const content = await complete(buildWordCardMessages(input), 1200);
      const parsed = parseWordCardResponse(content, {
        word: input.word,
        sentence: input.sentence,
      });
      return {
        kind: "word" as const,
        target: input.target,
        word: parsed.word || input.word,
        sentence: input.sentence,
        phonetic: parsed.phonetic,
        partOfSpeech: parsed.partOfSpeech,
        contextualMeaning: parsed.contextualMeaning,
        commonMeaning: parsed.commonMeaning,
        forms: parsed.forms,
      };
    },

    async translate(input: TextRequestInput) {
      const content = await complete(buildTranslationMessages(input), 2500);
      return {
        kind: "translation" as const,
        target: input.target,
        mode: translationMode(input),
        source: input.text,
        translation: parseTranslationResponse(content),
        rows: null,
      };
    },

    async analyze(input: TextRequestInput) {
      const content = await complete(buildAnalysisMessages(input), 3000);
      return {
        kind: "analysis" as const,
        target: input.target,
        ...parseAnalysisResponse(content, input.text),
      };
    },
  };
}