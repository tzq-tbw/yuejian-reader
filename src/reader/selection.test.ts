import { afterEach, describe, expect, it } from "vitest";
import { captureSelection, wordSelectionFromMark } from "./selection";

afterEach(() => {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});

function selectionBetween(
  startNode: Node,
  startOffset: number,
  endNode: Node,
  endOffset: number,
): Selection {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection();
  if (!selection) throw new Error("jsdom 缺少 Selection");
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

describe("选区读取", () => {
  it("跨段落选区保留两段文字与绝对起止", () => {
    document.body.innerHTML = [
      '<div id="root">',
      '<p data-i="0">We need to address the problem.</p>',
      '<p data-i="1">Please write your address on the envelope.</p>',
      "</div>",
    ].join("");
    const root = document.querySelector<HTMLElement>("#root")!;
    const p0 = root.querySelector<HTMLElement>('p[data-i="0"]')!;
    const p1 = root.querySelector<HTMLElement>('p[data-i="1"]')!;
    const selection = selectionBetween(
      p0.firstChild!,
      p0.textContent!.indexOf("address"),
      p1.firstChild!,
      p1.textContent!.indexOf("address") + "address".length,
    );

    const captured = captureSelection(root, selection);
    expect(captured).not.toBeNull();
    expect(captured!.text).toBe(
      "address the problem.\n\nPlease write your address",
    );
    expect(captured!.start).toEqual({ paragraph: 0, offset: 11 });
    expect(captured!.end).toEqual({ paragraph: 1, offset: 25 });
    expect(captured!.paragraphs).toEqual([
      { index: 0, text: "address the problem." },
      { index: 1, text: "Please write your address" },
    ]);
  });

  it("跨词表标记选区不影响字符偏移", () => {
    document.body.innerHTML = [
      '<div id="root"><p data-i="0">',
      "We need to <mark>address</mark> the <mark>problem</mark>.",
      "</p></div>",
    ].join("");
    const root = document.querySelector<HTMLElement>("#root")!;
    const paragraph = root.querySelector<HTMLElement>('p[data-i="0"]')!;
    const marks = paragraph.querySelectorAll("mark");
    const selection = selectionBetween(
      marks[0].firstChild!,
      0,
      marks[1].firstChild!,
      "problem".length,
    );

    const captured = captureSelection(root, selection);
    expect(captured?.text).toBe("address the problem");
    expect(captured?.start).toEqual({ paragraph: 0, offset: 11 });
    expect(captured?.end).toEqual({ paragraph: 0, offset: 30 });
  });

  it("去掉选区首尾空白并同步偏移", () => {
    document.body.innerHTML =
      '<div id="root"><p data-i="0">We need to address the problem.</p></div>';
    const root = document.querySelector<HTMLElement>("#root")!;
    const paragraph = root.querySelector<HTMLElement>('p[data-i="0"]')!;
    const text = paragraph.textContent!;
    const selection = selectionBetween(
      paragraph.firstChild!,
      text.indexOf(" address") ,
      paragraph.firstChild!,
      text.indexOf("address") + "address ".length,
    );
    const captured = captureSelection(root, selection);
    expect(captured?.text).toBe("address");
    expect(captured?.start).toEqual({ paragraph: 0, offset: 11 });
    expect(captured?.end).toEqual({ paragraph: 0, offset: 18 });
  });

  it("点击词表标记生成单词选区", () => {
    document.body.innerHTML =
      '<div id="root"><p data-i="0">We need to <mark class="vocabMark cet4">address</mark> the problem.</p></div>';
    const paragraph = document.querySelector<HTMLElement>('p[data-i="0"]')!;
    const mark = paragraph.querySelector<HTMLElement>("mark")!;
    const captured = wordSelectionFromMark(paragraph, mark);
    expect(captured).toMatchObject({
      text: "address",
      start: { paragraph: 0, offset: 11 },
      end: { paragraph: 0, offset: 18 },
    });
  });
});