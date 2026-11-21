import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { createMemoryStorage, createMockApi } from "../data/mock";
import type { LanguageService } from "../language/types";
import { localDateKey } from "../review/schedule";

const ARTICLE = [
  "We need to address the problem before the meeting.",
  "Please write your address on the envelope.",
  "First sentence. Second sentence.",
  "We need to take off now.",
].join("\n\n");

const language: LanguageService = {
  async wordCard(input) {
    return {
      kind: "word",
      target: input.target,
      word: input.word,
      sentence: input.sentence,
      phonetic: "/test/",
      partOfSpeech: "v.",
      contextualMeaning: `语境:${input.word}`,
      commonMeaning: "常见义",
      forms: ["过去式: tested"],
    };
  },
  async translate(input) {
    return {
      kind: "translation",
      target: input.target,
      mode: input.target.operation === "paragraph" ? "paragraph" : "selection",
      source: input.text,
      translation: `译文:${input.text}`,
      rows: null,
    };
  },
  async analyze(input) {
    return {
      kind: "analysis",
      target: input.target,
      source: input.text,
      trunk: "语法主干",
      clauses: [],
      modifiers: [],
      collocations: [],
    };
  },
};

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

function selectInParagraph(index: number, start: number, end: number): void {
  const apply = () => {
    const paragraph = document.querySelector<HTMLElement>(`p[data-i="${index}"]`)!;
    const startPoint = findTextNode(paragraph, start);
    const endPoint = findTextNode(paragraph, end);
    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.mouseUp(paragraph);
  };
  // 先关闭旧工具条；若首次选区撞上 React 提交导致 Range 失效，用新节点重试一次。
  const initial = document.querySelector<HTMLElement>(`p[data-i="${index}"]`)!;
  window.getSelection()?.removeAllRanges();
  fireEvent.mouseUp(initial);
  apply();
  if (!document.querySelector('[role="toolbar"]')) {
    window.setTimeout(apply, 0);
  }
}

async function setup() {
  const storage = createMemoryStorage();
  const api = createMockApi(storage);
  const article = await api.pasteArticle({ title: "Collection Flow", text: ARTICLE });
  const user = userEvent.setup();
  render(<App api={api} language={language} />);
  await waitFor(() => {
    expect(document.querySelectorAll("p[data-i]")).toHaveLength(4);
  });
  return { api, user, article, storage };
}

async function askWord(user: ReturnType<typeof userEvent.setup>, index: number) {
  const paragraph = document.querySelector<HTMLElement>(`p[data-i="${index}"]`)!;
  const text = paragraph.textContent ?? "";
  const start = text.indexOf("address");
  selectInParagraph(index, start, start + "address".length);
  await screen.findByRole("toolbar", { name: "选区操作" });
  await user.click(screen.getByRole("button", { name: "查看词卡" }));
  const inspector = screen.getByLabelText("精读侧栏");
  await within(inspector).findByRole("heading", { name: "address" });
  await within(inspector).findByText((paragraph.textContent ?? "").trim());
  return inspector;
}

async function translateParagraph(
  user: ReturnType<typeof userEvent.setup>,
  index: number,
) {
  const paragraph = document.querySelector<HTMLElement>(`p[data-i="${index}"]`)!;
  const text = paragraph.textContent ?? "";
  selectInParagraph(index, 0, text.length);
  await screen.findByRole("toolbar", { name: "选区操作" });
  await user.click(screen.getByRole("button", { name: "翻译" }));
  const inspector = screen.getByLabelText("精读侧栏");
  await within(inspector).findByText(`译文:${text}`);
  return inspector;
}

beforeEach(() => {
  window.localStorage.clear();
  window.getSelection()?.removeAllRanges();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("精读侧栏收藏入口", () => {
  it("词卡收藏词语，换原句可新增；短语翻译收进生词本", async () => {
    const { api, user } = await setup();
    const inspector = await askWord(user, 0);
    await user.click(
      within(inspector).getByRole("button", { name: "收藏词语" }),
    );
    expect(await within(inspector).findByText("已收藏")).toBeInTheDocument();
    await waitFor(async () => {
      expect(await api.listWordFavorites(localDateKey())).toHaveLength(1);
    });

    // 换一句原句收藏同一个词
    await askWord(user, 1);
    await user.click(screen.getByRole("button", { name: "收藏词语" }));
    await waitFor(async () => {
      const items = await api.listWordFavorites(localDateKey());
      expect(items).toHaveLength(2);
      expect(items.map((item) => item.normalizedSentence)).toEqual(
        expect.arrayContaining([
          "we need to address the problem before the meeting.",
          "please write your address on the envelope.",
        ]),
      );
    });

    // 短语翻译进入生词本
    const paragraph = document.querySelector<HTMLElement>('p[data-i="3"]')!;
    const text = paragraph.textContent ?? "";
    const start = text.indexOf("take off");
    selectInParagraph(3, start, start + "take off".length);
    await screen.findByRole("toolbar", { name: "选区操作" });
    await user.click(screen.getByRole("button", { name: "翻译" }));
    const phraseInspector = screen.getByLabelText("精读侧栏");
    await within(phraseInspector).findByText("译文:take off");
    await user.click(
      within(phraseInspector).getByRole("button", { name: "收藏短语" }),
    );
    await waitFor(async () => {
      const items = await api.listWordFavorites(localDateKey());
      expect(items).toHaveLength(3);
      expect(items.some((item) => item.word === "take off")).toBe(true);
    });
  });

  it("完整单句直接收藏，多句先确认；取消不新增，确认存一条；解析入口复用同处", async () => {
    const { api, user } = await setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    // 完整单句：不弹确认
    const single = await translateParagraph(user, 0);
    await user.click(
      within(single).getByRole("button", { name: "收藏长难句" }),
    );
    expect(await within(single).findByText("已收藏")).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    await waitFor(async () => {
      expect(await api.listLongSentenceFavorites()).toHaveLength(1);
    });

    // 多句整段：取消后不新增
    const multi = await translateParagraph(user, 2);
    await user.click(
      within(multi).getByRole("button", { name: "收藏长难句" }),
    );
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(await api.listLongSentenceFavorites()).toHaveLength(1);

    // 再次点击并确认：整段作为一条保存
    confirm.mockReturnValue(true);
    await user.click(
      within(multi).getByRole("button", { name: "收藏长难句" }),
    );
    expect(await within(multi).findByText("已收藏")).toBeInTheDocument();
    await waitFor(async () => {
      const items = await api.listLongSentenceFavorites();
      expect(items).toHaveLength(2);
      expect(items.some((item) => item.sourceText === "First sentence. Second sentence.")).toBe(
        true,
      );
    });

    // 同一处改用解析入口收藏：复用已有记录，不重复新增
    selectInParagraph(0, 0, ARTICLE.split("\n\n")[0].length);
    await screen.findByRole("toolbar", { name: "选区操作" });
    await user.click(screen.getByRole("button", { name: "解析" }));
    const analysisInspector = screen.getByLabelText("精读侧栏");
    await within(analysisInspector).findByText("语法主干", { selector: "p" });
    await user.click(
      within(analysisInspector).getByRole("button", { name: "收藏长难句" }),
    );
    await waitFor(async () => {
      expect(await api.listLongSentenceFavorites()).toHaveLength(2);
    });
  });

  it("整段翻译入口收藏单句段落也先确认", async () => {
    const { api, user } = await setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    await user.click(screen.getByTitle("翻译第 1 段"));
    const inspector = screen.getByLabelText("精读侧栏");
    await within(inspector).findByText(
      "译文:We need to address the problem before the meeting.",
    );
    await user.click(
      within(inspector).getByRole("button", { name: "收藏长难句" }),
    );

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(await api.listLongSentenceFavorites()).toHaveLength(0);
  });
});