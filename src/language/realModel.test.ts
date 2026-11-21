/**
 * 可选的真实模型联调，默认跳过。
 * 运行：YUEJIAN_REAL_MODEL=1 npx vitest run src/language/realModel.test.ts
 * 需要本机 Magpie 代理（默认 http://127.0.0.1:3425/v1）已启动。
 */
import { describe, expect, it } from "vitest";
import { createLanguageService } from "./service";
import { createFetchTransport } from "./transport";
import { selectionTarget } from "./targets";
import type { ChatMessage, ChatTransport } from "./types";

const enabled = process.env.YUEJIAN_REAL_MODEL === "1";

interface Recorded {
  label: string;
  messages: ChatMessage[];
  raw: unknown;
}

function responseSample(raw: unknown) {
  if (raw === null || typeof raw !== "object") return raw;
  const record = raw as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const choice = (choices[0] ?? {}) as Record<string, unknown>;
  const message = (choice.message ?? {}) as Record<string, unknown>;
  return {
    id: record.id,
    model: record.model,
    content: message.content,
    finishReason: choice.finish_reason,
    usage: record.usage,
  };
}

describe.skipIf(!enabled)("真实 Magpie 模型联调", () => {
  it("词卡、翻译、句法解析各调用一次", async () => {
    const records: Recorded[] = [];
    const fetchTransport = createFetchTransport();
    let label = "";
    const transport: ChatTransport = {
      async chat(call) {
        const raw = await fetchTransport.chat(call);
        records.push({ label, messages: call.messages, raw });
        return raw;
      },
    };
    const service = createLanguageService({ transport });
    const article = {
      id: 1,
      version: 1,
      paragraphs: [
        "The city street looks different on foot, and residents say walkability matters more than parking.",
        "We need to address the problem before the meeting.",
      ],
    };

    label = "词卡";
    const wordTarget = selectionTarget(article, "word", {
      text: "address",
      start: { paragraph: 1, offset: 11 },
      end: { paragraph: 1, offset: 18 },
      paragraphs: [{ index: 1, text: "address" }],
    });
    const word = await service.wordCard({
      target: wordTarget,
      word: "address",
      sentence: "We need to address the problem before the meeting.",
      paragraph: article.paragraphs[1],
      articleTitle: "The City at Walking Speed",
    });

    label = "翻译";
    const sentence = "We need to address the problem before the meeting.";
    const translateTarget = selectionTarget(article, "translate", {
      text: sentence,
      start: { paragraph: 1, offset: 0 },
      end: { paragraph: 1, offset: sentence.length },
      paragraphs: [{ index: 1, text: sentence }],
    });
    const translation = await service.translate({
      target: translateTarget,
      text: sentence,
      paragraphs: [{ index: 1, text: sentence }],
      articleTitle: "The City at Walking Speed",
    });

    label = "解析";
    const analysisSentence =
      "The city street looks different on foot, and residents say walkability matters more than parking.";
    const analysisTarget = selectionTarget(article, "parse", {
      text: analysisSentence,
      start: { paragraph: 0, offset: 0 },
      end: { paragraph: 0, offset: analysisSentence.length },
      paragraphs: [{ index: 0, text: analysisSentence }],
    });
    const analysis = await service.analyze({
      target: analysisTarget,
      text: analysisSentence,
      paragraphs: [{ index: 0, text: analysisSentence }],
      articleTitle: "The City at Walking Speed",
    });

    for (const record of records) {
      console.log(`\n=== ${record.label} · 原始响应 ===`);
      console.log(JSON.stringify(responseSample(record.raw), null, 2));
    }
    console.log("\n=== 词卡 · 解析结果 ===");
    console.log(JSON.stringify(word, null, 2));
    console.log("\n=== 翻译 · 解析结果 ===");
    console.log(JSON.stringify(translation, null, 2));
    console.log("\n=== 解析 · 解析结果 ===");
    console.log(JSON.stringify(analysis, null, 2));

    expect(records).toHaveLength(3);
    expect(word.contextualMeaning).toBeTruthy();
    expect(word.commonMeaning).toBeTruthy();
    expect(translation.translation.length).toBeGreaterThan(0);
    expect(
      analysis.trunk ||
        analysis.clauses.length ||
        analysis.modifiers.length ||
        analysis.collocations.length,
    ).toBeTruthy();
  }, 240_000);
});