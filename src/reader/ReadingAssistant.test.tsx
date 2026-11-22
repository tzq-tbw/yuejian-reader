import { beforeEach, describe, expect, it } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { createMemoryStorage, createMockApi } from "../data/mock";
import { createLanguageService } from "../language/service";
import type {
  AnalysisResult,
  LanguageService,
  TextRequestInput,
  TranslationResult,
  WordCard,
  WordRequestInput,
} from "../language/types";

const ARTICLE =
  "We need to address the problem before the meeting.\n\nPlease write your address on the envelope.";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createFakeLanguage() {
  const wordCalls: Array<{ input: WordRequestInput; deferred: Deferred<WordCard> }> = [];
  const translateCalls: Array<{
    input: TextRequestInput;
    deferred: Deferred<TranslationResult>;
  }> = [];
  const analyzeCalls: Array<{
    input: TextRequestInput;
    deferred: Deferred<AnalysisResult>;
  }> = [];

  const service: LanguageService = {
    wordCard(input) {
      const pending = defer<WordCard>();
      wordCalls.push({ input, deferred: pending });
      return pending.promise;
    },
    translate(input) {
      const pending = defer<TranslationResult>();
      translateCalls.push({ input, deferred: pending });
      return pending.promise;
    },
    analyze(input) {
      const pending = defer<AnalysisResult>();
      analyzeCalls.push({ input, deferred: pending });
      return pending.promise;
    },
  };
  return { service, wordCalls, translateCalls, analyzeCalls };
}

function makeWordCard(
  input: WordRequestInput,
  word: string,
  contextualMeaning: string,
  commonMeaning: string,
): WordCard {
  return {
    kind: "word",
    target: input.target,
    word,
    sentence: input.sentence,
    phonetic: "/ˈædres/",
    partOfSpeech: "v.",
    contextualMeaning,
    commonMeaning,
    forms: ["复数: addresses"],
  };
}

function makeTranslation(
  input: TextRequestInput,
  translation: string,
): TranslationResult {
  return {
    kind: "translation",
    target: input.target,
    mode: input.target.operation === "paragraph" ? "paragraph" : "selection",
    source: input.text,
    translation,
    rows: null,
  };
}

function makeAnalysis(input: TextRequestInput): AnalysisResult {
  return {
    kind: "analysis",
    target: input.target,
    source: input.text,
    trunk: "主语 We，谓语 need，宾语 to address the problem",
    clauses: [],
    modifiers: ["before the meeting 是时间状语"],
    collocations: [{ phrase: "address the problem", meaning: "处理问题" }],
  };
}

function findTextNode(
  root: Node,
  offset: number,
): { node: Text; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    if (remaining <= text.data.length) {
      return { node: text, offset: remaining };
    }
    remaining -= text.data.length;
    current = walker.nextNode();
  }
  throw new Error("选区偏移超出段落范围");
}

function applyRange(
  startNode: Node,
  startOffset: number,
  endNode: Node,
  endOffset: number,
): void {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection();
  if (!selection) throw new Error("缺少 Selection");
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectInParagraph(index: number, start: number, end: number): HTMLElement {
  const apply = () => {
    const paragraph = document.querySelector<HTMLElement>(`p[data-i="${index}"]`)!;
    const startPoint = findTextNode(paragraph, start);
    const endPoint = findTextNode(paragraph, end);
    applyRange(startPoint.node, startPoint.offset, endPoint.node, endPoint.offset);
    fireEvent.mouseUp(paragraph);
    return paragraph;
  };
  // 先清掉上一次的选区工具条；若首次选区恰好撞上 React 提交导致 Range 失效，
  // 等当前任务结束后用新 DOM 节点重试一次。
  const initial = document.querySelector<HTMLElement>(`p[data-i="${index}"]`)!;
  window.getSelection()?.removeAllRanges();
  fireEvent.mouseUp(initial);
  const paragraph = apply();
  if (!document.querySelector('[role="toolbar"]')) {
    window.setTimeout(apply, 0);
  }
  return paragraph;
}

function selectAcrossParagraphs(
  startIndex: number,
  startOffset: number,
  endIndex: number,
  endOffset: number,
): void {
  const apply = () => {
    const startParagraph = document.querySelector<HTMLElement>(
      `p[data-i="${startIndex}"]`,
    )!;
    const endParagraph = document.querySelector<HTMLElement>(
      `p[data-i="${endIndex}"]`,
    )!;
    const startPoint = findTextNode(startParagraph, startOffset);
    const endPoint = findTextNode(endParagraph, endOffset);
    applyRange(startPoint.node, startPoint.offset, endPoint.node, endPoint.offset);
    fireEvent.mouseUp(endParagraph);
  };
  const initial = document.querySelector<HTMLElement>(`p[data-i="${startIndex}"]`)!;
  window.getSelection()?.removeAllRanges();
  fireEvent.mouseUp(initial);
  apply();
  if (!document.querySelector('[role="toolbar"]')) {
    window.setTimeout(apply, 0);
  }
}

function paragraphTexts(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>("p[data-i]")).map(
    (paragraph) => paragraph.textContent ?? "",
  );
}

async function setup(extraArticle?: { title: string; text: string }) {
  const storage = createMemoryStorage();
  const api = createMockApi(storage);
  await api.pasteArticle({ title: "Address in Context", text: ARTICLE });
  if (extraArticle) await api.pasteArticle(extraArticle);
  const fake = createFakeLanguage();
  const user = userEvent.setup();
  render(<App api={api} language={fake.service} />);
  await screen.findAllByText("我的阅读");
  await waitFor(() => {
    expect(document.querySelectorAll("p[data-i]").length).toBe(2);
  });
  const inspector = screen.getByLabelText("精读侧栏");
  return { fake, user, inspector, api };
}

async function askWord(
  user: ReturnType<typeof userEvent.setup>,
  start: number,
  end: number,
) {
  selectInParagraph(0, start, end);
  await screen.findByRole("toolbar", { name: "选区操作" });
  await user.click(screen.getByRole("button", { name: "查看词卡" }));
}

beforeEach(() => {
  window.localStorage.clear();
  window.getSelection()?.removeAllRanges();
});

describe("精读工作台", () => {
  it("单词选区提供查看词卡，短语选区提供翻译与解析", async () => {
    await setup();
    selectInParagraph(0, 11, 18);
    const wordToolbar = await screen.findByRole("toolbar", { name: "选区操作" });
    expect(
      within(wordToolbar).getByRole("button", { name: "查看词卡" }),
    ).toBeInTheDocument();
    expect(
      within(wordToolbar).queryByRole("button", { name: "翻译" }),
    ).not.toBeInTheDocument();

    window.getSelection()?.removeAllRanges();
    fireEvent.mouseUp(document.querySelector('p[data-i="0"]')!);
    await waitFor(() => {
      expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    });

    selectInParagraph(0, 11, 30);
    const phraseToolbar = await screen.findByRole("toolbar", { name: "选区操作" });
    expect(
      within(phraseToolbar).getByRole("button", { name: "翻译" }),
    ).toBeInTheDocument();
    expect(
      within(phraseToolbar).getByRole("button", { name: "解析" }),
    ).toBeInTheDocument();
    expect(
      within(phraseToolbar).queryByRole("button", { name: "查看词卡" }),
    ).not.toBeInTheDocument();
  });

  it("选择屈折形式 addresses 时侧栏显示模型返回的原形 address", async () => {
    const storage = createMemoryStorage();
    const api = createMockApi(storage);
    await api.pasteArticle({
      title: "Inflected Word",
      text: "These addresses need attention.",
    });
    const language = createLanguageService({
      transport: {
        async chat() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    word: "address",
                    contextualMeaning: "地址",
                    commonMeaning: "地址；演说",
                    forms: ["复数: addresses"],
                  }),
                },
              },
            ],
          };
        },
      },
    });
    const user = userEvent.setup();
    render(<App api={api} language={language} />);
    await waitFor(() => {
      expect(document.querySelectorAll("p[data-i]")).toHaveLength(1);
    });

    selectInParagraph(0, 6, 15);
    await screen.findByRole("toolbar", { name: "选区操作" });
    await user.click(screen.getByRole("button", { name: "查看词卡" }));

    const inspector = screen.getByLabelText("精读侧栏");
    expect(
      await within(inspector).findByRole("heading", { name: "address" }),
    ).toBeInTheDocument();
    expect(
      within(inspector).queryByRole("heading", { name: "addresses" }),
    ).not.toBeInTheDocument();
  });

  it("新请求完成前保留上一次词卡，旧请求最后返回也不会覆盖新词卡", async () => {
    const { fake, user, inspector } = await setup();

    await askWord(user, 11, 18);
    expect(fake.wordCalls).toHaveLength(1);
    expect(
      within(inspector).getByText("正在生成词卡 · address…"),
    ).toBeInTheDocument();
    await act(async () => {
      fake.wordCalls[0].deferred.resolve(
        makeWordCard(fake.wordCalls[0].input, "address", "处理", "地址；处理"),
      );
    });
    expect(
      await within(inspector).findByRole("heading", { name: "address" }),
    ).toBeInTheDocument();
    expect(within(inspector).getByText("处理")).toBeInTheDocument();

    // 第二个请求：完成前仍显示上一张词卡。
    await askWord(user, 23, 30);
    expect(fake.wordCalls).toHaveLength(2);
    expect(
      within(inspector).getByRole("heading", { name: "address" }),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText("正在生成词卡 · problem…"),
    ).toBeInTheDocument();

    // 第三个请求先返回，应显示 meeting。
    await askWord(user, 42, 49);
    expect(fake.wordCalls).toHaveLength(3);
    await act(async () => {
      fake.wordCalls[2].deferred.resolve(
        makeWordCard(fake.wordCalls[2].input, "meeting", "会议", "会议"),
      );
    });
    expect(
      await within(inspector).findByRole("heading", { name: "meeting" }),
    ).toBeInTheDocument();

    // 旧请求（problem）最后返回，不得覆盖当前词卡。
    await act(async () => {
      fake.wordCalls[1].deferred.resolve(
        makeWordCard(fake.wordCalls[1].input, "problem", "问题", "问题"),
      );
    });
    expect(
      within(inspector).getByRole("heading", { name: "meeting" }),
    ).toBeInTheDocument();
    expect(
      within(inspector).queryByRole("heading", { name: "problem" }),
    ).not.toBeInTheDocument();
  });

  it("最新请求完成后旧请求 reject 不恢复旧错误或覆盖结果", async () => {
    const { fake, user, inspector } = await setup();

    await askWord(user, 11, 18);
    await askWord(user, 42, 49);
    expect(fake.wordCalls).toHaveLength(2);
    await act(async () => {
      fake.wordCalls[1].deferred.resolve(
        makeWordCard(fake.wordCalls[1].input, "meeting", "会议", "会议"),
      );
    });
    expect(
      await within(inspector).findByRole("heading", { name: "meeting" }),
    ).toBeInTheDocument();

    await act(async () => {
      fake.wordCalls[0].deferred.reject(new Error("旧请求失败"));
    });
    expect(
      within(inspector).getByRole("heading", { name: "meeting" }),
    ).toBeInTheDocument();
    expect(within(inspector).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(inspector).queryByText("旧请求失败")).not.toBeInTheDocument();
  });

  it("新译文 pending 期间保留旧译文，成功后替换", async () => {
    const { fake, user, inspector } = await setup();

    selectInParagraph(0, 11, 30);
    await screen.findByRole("toolbar", { name: "选区操作" });
    await user.click(screen.getByRole("button", { name: "翻译" }));
    await act(async () => {
      fake.translateCalls[0].deferred.resolve(
        makeTranslation(fake.translateCalls[0].input, "旧译文"),
      );
    });
    expect(await within(inspector).findByText("旧译文")).toBeInTheDocument();

    selectInParagraph(0, 11, 30);
    await screen.findByRole("toolbar", { name: "选区操作" });
    await user.click(screen.getByRole("button", { name: "翻译" }));
    expect(fake.translateCalls).toHaveLength(2);
    expect(within(inspector).getByText("旧译文")).toBeInTheDocument();
    expect(within(inspector).getByText("正在生成翻译选区…")).toBeInTheDocument();

    await act(async () => {
      fake.translateCalls[1].deferred.resolve(
        makeTranslation(fake.translateCalls[1].input, "新译文"),
      );
    });
    expect(await within(inspector).findByText("新译文")).toBeInTheDocument();
    expect(within(inspector).queryByText("旧译文")).not.toBeInTheDocument();
  });

  it("翻译后解析追加在同一结果下，请求目标保持同一选区", async () => {
    const { fake, user, inspector } = await setup();

    selectInParagraph(0, 11, 30);
    await screen.findByRole("toolbar", { name: "选区操作" });
    await user.click(screen.getByRole("button", { name: "翻译" }));
    expect(fake.translateCalls).toHaveLength(1);
    await act(async () => {
      fake.translateCalls[0].deferred.resolve(
        makeTranslation(fake.translateCalls[0].input, "我们需要在会议前处理这个问题。"),
      );
    });
    expect(
      await within(inspector).findByText("我们需要在会议前处理这个问题。"),
    ).toBeInTheDocument();

    selectInParagraph(0, 11, 30);
    await screen.findByRole("toolbar", { name: "选区操作" });
    await user.click(screen.getByRole("button", { name: "解析" }));
    expect(fake.analyzeCalls).toHaveLength(1);
    const translationTarget = fake.translateCalls[0].input.target;
    expect(fake.analyzeCalls[0].input.target.start).toEqual(translationTarget.start);
    expect(fake.analyzeCalls[0].input.target.end).toEqual(translationTarget.end);

    // 解析请求未完成时，译文仍保留。
    expect(
      within(inspector).getByText("我们需要在会议前处理这个问题。"),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText("正在生成解析选区…"),
    ).toBeInTheDocument();

    await act(async () => {
      fake.analyzeCalls[0].deferred.resolve(
        makeAnalysis(fake.analyzeCalls[0].input),
      );
    });
    expect(await within(inspector).findByText("语法解析")).toBeInTheDocument();
    expect(
      within(inspector).getByText("主语 We，谓语 need，宾语 to address the problem"),
    ).toBeInTheDocument();
    expect(within(inspector).getByText("修饰关系")).toBeInTheDocument();
    expect(within(inspector).getByText("短语搭配")).toBeInTheDocument();
    // 译文仍在同一结果下。
    expect(
      within(inspector).getByText("我们需要在会议前处理这个问题。"),
    ).toBeInTheDocument();
  });

  it("跨段划选可翻译，请求携带两段起止与原文", async () => {
    const { fake, user, inspector } = await setup();
    selectAcrossParagraphs(0, 11, 1, 25);
    const toolbar = await screen.findByRole("toolbar", { name: "选区操作" });
    await user.click(within(toolbar).getByRole("button", { name: "翻译" }));
    expect(fake.translateCalls).toHaveLength(1);
    const { target, text } = fake.translateCalls[0].input;
    expect(target.start).toEqual({ paragraph: 0, offset: 11 });
    expect(target.end).toEqual({ paragraph: 1, offset: 25 });
    expect(target.paragraphs).toEqual([0, 1]);
    expect(text).toContain("address the problem before the meeting.");
    expect(text).toContain("Please write your address");

    await act(async () => {
      fake.translateCalls[0].deferred.resolve(
        makeTranslation(
          fake.translateCalls[0].input,
          "我们需要处理这个问题。\n\n请把你的地址写在信封上。",
        ),
      );
    });
    expect(
      await within(inspector).findByText(/请把你的地址写在信封上/),
    ).toBeInTheDocument();
  });

  it("全文翻译按段落展示，失败段落可单独重试", async () => {
    const { fake, user, inspector } = await setup();
    await user.click(screen.getByRole("button", { name: "全文翻译" }));
    expect(fake.translateCalls).toHaveLength(2);

    await act(async () => {
      fake.translateCalls[0].deferred.resolve(
        makeTranslation(fake.translateCalls[0].input, "第一段译文"),
      );
      fake.translateCalls[1].deferred.reject(new Error("网络不可用"));
    });
    expect(
      await within(inspector).findByText("第一段译文"),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText("本段翻译失败：网络不可用"),
    ).toBeInTheDocument();

    await user.click(
      within(inspector).getByRole("button", { name: "重试本段" }),
    );
    expect(fake.translateCalls).toHaveLength(3);
    await act(async () => {
      fake.translateCalls[2].deferred.resolve(
        makeTranslation(fake.translateCalls[2].input, "第二段译文"),
      );
    });
    expect(await within(inspector).findByText("第二段译文")).toBeInTheDocument();
    expect(
      within(inspector).queryByText(/本段翻译失败/),
    ).not.toBeInTheDocument();
  });

  it("全文翻译最多同时派发三段，完成一段后才补下一段", async () => {
    const api = createMockApi(createMemoryStorage());
    await api.pasteArticle({
      title: "Long Article",
      text: Array.from({ length: 7 }, (_, index) => `Paragraph ${index + 1}.`).join("\n\n"),
    });
    const fake = createFakeLanguage();
    const user = userEvent.setup();
    render(<App api={api} language={fake.service} />);
    await waitFor(() => expect(document.querySelectorAll("p[data-i]")).toHaveLength(7));

    await user.click(screen.getByRole("button", { name: "全文翻译" }));
    expect(fake.translateCalls).toHaveLength(3);
    await act(async () => {
      fake.translateCalls[0].deferred.resolve(
        makeTranslation(fake.translateCalls[0].input, "第一段译文"),
      );
    });
    await waitFor(() => expect(fake.translateCalls).toHaveLength(4));
    expect(fake.translateCalls[3].input.text).toBe("Paragraph 4.");
  });

  it("全文翻译切换文章后停止派发剩余段落", async () => {
    const api = createMockApi(createMemoryStorage());
    await api.pasteArticle({
      title: "Long Article",
      text: Array.from({ length: 6 }, (_, index) => `Paragraph ${index + 1}.`).join("\n\n"),
    });
    await api.pasteArticle({ title: "Short Article", text: "A different article." });
    const fake = createFakeLanguage();
    const user = userEvent.setup();
    render(<App api={api} language={fake.service} />);
    await waitFor(() => expect(document.querySelectorAll("p[data-i]")).toHaveLength(6));

    await user.click(screen.getByRole("button", { name: "全文翻译" }));
    expect(fake.translateCalls).toHaveLength(3);
    await user.click(screen.getByText("Short Article"));
    await waitFor(() => expect(paragraphTexts()).toEqual(["A different article."]));
    await act(async () => {
      for (const call of fake.translateCalls) {
        call.deferred.resolve(makeTranslation(call.input, "旧文章译文"));
      }
    });
    expect(fake.translateCalls).toHaveLength(3);
    expect(screen.queryByText("旧文章译文")).not.toBeInTheDocument();
  });

  it("单段重试中发起其他请求且后者失败，该行仍可重试", async () => {
    const { fake, user, inspector } = await setup();
    await user.click(screen.getByRole("button", { name: "全文翻译" }));
    await act(async () => {
      fake.translateCalls[0].deferred.resolve(
        makeTranslation(fake.translateCalls[0].input, "第一段译文"),
      );
      fake.translateCalls[1].deferred.reject(new Error("网络不可用"));
    });
    expect(
      await within(inspector).findByText("本段翻译失败：网络不可用"),
    ).toBeInTheDocument();

    await user.click(
      within(inspector).getByRole("button", { name: "重试本段" }),
    );
    expect(fake.translateCalls).toHaveLength(3);
    expect(within(inspector).getByText("正在重新翻译本段…")).toBeInTheDocument();

    await askWord(user, 11, 18);
    expect(fake.wordCalls).toHaveLength(1);
    await act(async () => {
      fake.wordCalls[0].deferred.reject(new Error("词卡请求失败"));
    });
    expect(
      await within(inspector).findByText("词卡请求失败"),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText("本段翻译失败：网络不可用"),
    ).toBeInTheDocument();

    await act(async () => {
      fake.translateCalls[2].deferred.reject(new Error("旧重试失败"));
    });
    expect(
      within(inspector).getByText("本段翻译失败：网络不可用"),
    ).toBeInTheDocument();

    await user.click(
      within(inspector).getByRole("button", { name: "重试本段" }),
    );
    expect(fake.translateCalls).toHaveLength(4);
    await act(async () => {
      fake.translateCalls[3].deferred.resolve(
        makeTranslation(fake.translateCalls[3].input, "第二段重试成功"),
      );
    });
    expect(
      await within(inspector).findByText("第二段重试成功"),
    ).toBeInTheDocument();
    expect(
      within(inspector).queryByText(/本段翻译失败/),
    ).not.toBeInTheDocument();
  });

  it("切换文章立即关闭旧结果，旧响应返回后也不显示", async () => {
    const { fake, user, inspector } = await setup({
      title: "Another Reading",
      text: "A different street is quiet.",
    });
    await askWord(user, 11, 18);
    expect(fake.wordCalls).toHaveLength(1);

    await user.click(screen.getByText("Another Reading"));
    await waitFor(() => {
      expect(paragraphTexts()).toEqual(["A different street is quiet."]);
    });
    expect(inspector.querySelector(".content")).toBeEmptyDOMElement();

    await act(async () => {
      fake.wordCalls[0].deferred.resolve(
        makeWordCard(fake.wordCalls[0].input, "address", "处理", "地址；处理"),
      );
    });
    expect(
      within(inspector).queryByRole("heading", { name: "address" }),
    ).not.toBeInTheDocument();
    expect(inspector.querySelector(".content")).toBeEmptyDOMElement();
  });

  it("同文章版本 v1 到 v2 立即隐藏旧结果并拒绝旧响应", async () => {
    const { fake, user, inspector } = await setup();
    await askWord(user, 11, 18);
    expect(fake.wordCalls).toHaveLength(1);
    expect(within(inspector).getByText("正在生成词卡 · address…")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("正文"), {
      target: { value: `${ARTICLE}\n\nThe revised third paragraph.` },
    });
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(paragraphTexts()).toContain("The revised third paragraph.");
    });
    expect(inspector.querySelector(".content")).toBeEmptyDOMElement();

    await act(async () => {
      fake.wordCalls[0].deferred.resolve(
        makeWordCard(fake.wordCalls[0].input, "address", "处理", "地址；处理"),
      );
    });
    expect(
      within(inspector).queryByRole("heading", { name: "address" }),
    ).not.toBeInTheDocument();
    expect(inspector.querySelector(".content")).toBeEmptyDOMElement();
  });

  it("请求失败显示错误，重试成功后替换为词卡", async () => {
    const { fake, user, inspector } = await setup();
    await askWord(user, 11, 18);
    await act(async () => {
      fake.wordCalls[0].deferred.reject(new Error("无法连接模型服务"));
    });
    expect(
      await within(inspector).findByRole("alert"),
    ).toHaveTextContent("无法连接模型服务");

    await user.click(within(inspector).getByRole("button", { name: "重试" }));
    expect(fake.wordCalls).toHaveLength(2);
    await act(async () => {
      fake.wordCalls[1].deferred.resolve(
        makeWordCard(fake.wordCalls[1].input, "address", "处理", "地址；处理"),
      );
    });
    expect(
      await within(inspector).findByRole("heading", { name: "address" }),
    ).toBeInTheDocument();
    expect(within(inspector).queryByRole("alert")).not.toBeInTheDocument();
  });
});