import { describe, expect, it } from "vitest";
import {
  buildAnalysisMessages,
  buildTranslationMessages,
  buildWordCardMessages,
} from "./prompts";
import type { ReadingTarget, TextRequestInput, WordRequestInput } from "./types";

const target: ReadingTarget = {
  articleId: 3,
  version: 2,
  operation: "word",
  start: { paragraph: 0, offset: 11 },
  end: { paragraph: 0, offset: 18 },
  paragraphs: [0],
  text: "address",
};

const wordInput: WordRequestInput = {
  target,
  word: "address",
  sentence: "We need to address the problem before the meeting.",
  paragraph:
    "We need to address the problem before the meeting. Please write your address on the envelope.",
  articleTitle: "Address in Context",
};

const textInput: TextRequestInput = {
  target: {
    ...target,
    operation: "translate",
    end: { paragraph: 1, offset: 25 },
    paragraphs: [0, 1],
    text: "We need to address the problem.\n\nWrite your address.",
  },
  text: "We need to address the problem.\n\nWrite your address.",
  paragraphs: [
    { index: 0, text: "We need to address the problem." },
    { index: 1, text: "Write your address." },
  ],
  articleTitle: "Address in Context",
};

describe("提示词构建", () => {
  it("词卡提示词带入单词、原句、段落与词形要求", () => {
    const messages = buildWordCardMessages(wordInput);
    expect(messages).toHaveLength(2);
    const user = messages[1].content;
    expect(user).toContain("address");
    expect(user).toContain("We need to address the problem before the meeting.");
    expect(user).toContain("Please write your address on the envelope.");
    const system = messages[0].content;
    expect(system).toContain("语境义");
    expect(system).toContain("常见义");
    expect(system).toContain("词形");
    expect(system).toContain("JSON");
  });

  it("翻译提示词保留段落顺序与标记", () => {
    const messages = buildTranslationMessages(textInput);
    const user = messages[1].content;
    expect(user).toContain("[第 1 段] We need to address the problem.");
    expect(user).toContain("[第 2 段] Write your address.");
    expect(messages[0].content).toContain("只输出译文");
  });

  it("解析提示词要求主干、从句、修饰与搭配", () => {
    const messages = buildAnalysisMessages(textInput);
    const system = messages[0].content;
    expect(system).toContain("语法主干");
    expect(system).toContain("clauses");
    expect(system).toContain("modifiers");
    expect(system).toContain("collocations");
    expect(messages[1].content).toContain("We need to address the problem.");
  });
});