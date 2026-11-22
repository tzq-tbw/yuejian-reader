import { resolveModelConfig } from "../language/config";
import { extractChatContent } from "../language/parse";
import { createDefaultTransport } from "../language/transport";
import type { ChatTransport, ModelConfig } from "../language/types";
import { buildEssayReviewMessages } from "./prompts";
import { parseEssayReview } from "./parse";
import type { EssayReview, EssayService } from "./types";

export function createEssayService(options: {
  transport?: ChatTransport;
  config?: Partial<ModelConfig>;
} = {}): EssayService {
  const config = resolveModelConfig(options.config);
  const transport = options.transport ?? createDefaultTransport(config);
  return {
    async review(text: string): Promise<EssayReview> {
      const essay = text.trim();
      if (!essay) throw new Error("请先粘贴或导入一篇英语作文");
      if (essay.length > 30_000) throw new Error("作文过长，请控制在 30000 个字符以内");
      const raw = await transport.chat({
        messages: buildEssayReviewMessages(essay),
        temperature: config.temperature,
        maxTokens: 5000,
      });
      return parseEssayReview(extractChatContent(raw));
    },
  };
}
