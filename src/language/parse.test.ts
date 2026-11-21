import { describe, expect, it } from "vitest";
import {
  extractChatContent,
  parseAnalysisResponse,
  parseTranslationResponse,
  parseWordCardResponse,
  stripCodeFence,
} from "./parse";

describe("模型响应解析", () => {
  it("从 OpenAI 兼容响应中取出文本内容", () => {
    const raw = {
      choices: [
        {
          message: {
            role: "assistant",
            content: "OK",
          },
        },
      ],
    };
    expect(extractChatContent(raw)).toBe("OK");
  });

  it("兼容分段 content 数组", () => {
    const raw = {
      choices: [
        {
          message: {
            content: [
              { type: "text", text: "hello" },
              { type: "text", text: " world" },
            ],
          },
        },
      ],
    };
    expect(extractChatContent(raw)).toBe("hello world");
  });

  it("没有内容或返回 error 时给出可读错误", () => {
    expect(() => extractChatContent({ choices: [] })).toThrow("模型没有返回内容");
    expect(() =>
      extractChatContent({ error: { message: "余额不足" } }),
    ).toThrow("模型服务错误：余额不足");
    expect(() =>
      extractChatContent({
        choices: [
          {
            finish_reason: "length",
            message: { content: '{"trunk":"截断' },
          },
        ],
      }),
    ).toThrow("模型输出被截断");
  });

  it("去掉代码围栏", () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFence('```{"a":1}```')).toBe('{"a":1}');
  });

  it("解析带围栏和尾逗号的词卡 JSON", () => {
    const parsed = parseWordCardResponse(
      '```json\n{"word":"address","phonetic":"/əˈdres/","partOfSpeech":"v.","contextualMeaning":"处理","commonMeaning":"地址；处理","forms":["第三人称单数: addresses",],}\n```',
      { word: "address", sentence: "We need to address the problem." },
    );
    expect(parsed).toMatchObject({
      word: "address",
      phonetic: "/əˈdres/",
      partOfSpeech: "v.",
      contextualMeaning: "处理",
      commonMeaning: "地址；处理",
      forms: ["第三人称单数: addresses"],
    });
  });

  it("JSON 不可用时按标签兜底解析词卡", () => {
    const parsed = parseWordCardResponse(
      [
        "语境义：处理（问题）",
        "常见义：地址；处理",
        "词性：v.",
        "词形：addresses；addressed",
      ].join("\n"),
      { word: "address", sentence: "We need to address the problem." },
    );
    expect(parsed.word).toBe("address");
    expect(parsed.contextualMeaning).toBe("处理（问题）");
    expect(parsed.commonMeaning).toBe("地址；处理");
    expect(parsed.partOfSpeech).toBe("v.");
    expect(parsed.forms).toEqual(["addresses", "addressed"]);
  });

  it("词卡 JSON 缺少词义时仍尝试标签兜底，全部缺失则报错", () => {
    expect(() =>
      parseWordCardResponse('{"word":"address"}', {
        word: "address",
        sentence: "",
      }),
    ).toThrow("模型没有给出可用的词义");
  });

  it("翻译去掉围栏、标签和包裹引号", () => {
    expect(parseTranslationResponse('```\n译文：我们需要处理这个问题。\n```')).toBe(
      "我们需要处理这个问题。",
    );
    expect(parseTranslationResponse('"第一段。\n\n第二段。"')).toBe(
      "第一段。\n\n第二段。",
    );
  });

  it("解析句法 JSON 并归一化空字段与对象数组", () => {
    const parsed = parseAnalysisResponse(
      JSON.stringify({
        trunk: "We need to address the problem",
        clauses: [{ text: "before the meeting", explanation: "时间状语从句" }],
        modifiers: ["before the meeting 修饰主句动作"],
        collocations: [{ phrase: "address the problem", meaning: "处理问题" }],
      }),
      "We need to address the problem before the meeting.",
    );
    expect(parsed.trunk).toBe("We need to address the problem");
    expect(parsed.clauses).toEqual([
      { text: "before the meeting", explanation: "时间状语从句" },
    ]);
    expect(parsed.modifiers).toEqual(["before the meeting 修饰主句动作"]);
    expect(parsed.collocations).toEqual([
      { phrase: "address the problem", meaning: "处理问题" },
    ]);
  });

  it("空解析结果与非法 JSON 都报错", () => {
    expect(() =>
      parseAnalysisResponse(
        '{"trunk":"","clauses":[],"modifiers":[],"collocations":[]}',
        "text",
      ),
    ).toThrow("模型没有识别到可展示的句法成分");
    expect(() => parseAnalysisResponse("我觉得这句话很复杂。", "text")).toThrow(
      "模型返回的 JSON 无法解析",
    );
  });
});