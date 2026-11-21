import type { SelectionInput, TextAnchor } from "../language/types";
import { isSingleWord } from "../language/text";

export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface CapturedSelection extends SelectionInput {
  rect: AnchorRect;
}

interface ParagraphSlice {
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

function measureFromParagraphStart(
  paragraph: HTMLElement,
  node: Node,
  offset: number,
): number {
  const range = document.createRange();
  range.setStart(paragraph, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

function rangeRect(range: Range): AnchorRect {
  if (typeof range.getBoundingClientRect !== "function") {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  const rect = range.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * 读取浏览器 Selection，支持跨单词、跨标签和跨段落。
 * 每个覆盖的段落单独裁剪 Range，因此词表标色产生的 <mark> 不影响偏移。
 */
export function captureSelection(
  root: HTMLElement,
  selection: Selection | null,
): CapturedSelection | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const paragraphElements = Array.from(
    root.querySelectorAll<HTMLElement>("p[data-i]"),
  );
  if (!paragraphElements.length) return null;

  const startElement = paragraphElements.find((paragraph) =>
    paragraph.contains(range.startContainer),
  );
  const endElement = paragraphElements.find((paragraph) =>
    paragraph.contains(range.endContainer),
  );
  if (!startElement || !endElement) return null;

  const startPosition = paragraphElements.indexOf(startElement);
  const endPosition = paragraphElements.indexOf(endElement);
  if (startPosition < 0 || endPosition < startPosition) return null;

  const slices: ParagraphSlice[] = [];
  for (let position = startPosition; position <= endPosition; position += 1) {
    const paragraph = paragraphElements[position];
    const index = Number(paragraph.dataset.i);
    if (!Number.isFinite(index)) continue;
    const startsHere = position === startPosition;
    const endsHere = position === endPosition;

    const clipped = document.createRange();
    clipped.setStart(
      startsHere ? range.startContainer : paragraph,
      startsHere ? range.startOffset : 0,
    );
    clipped.setEnd(
      endsHere ? range.endContainer : paragraph,
      endsHere ? range.endOffset : paragraph.childNodes.length,
    );

    slices.push({
      index,
      text: clipped.toString(),
      startOffset: startsHere
        ? measureFromParagraphStart(paragraph, range.startContainer, range.startOffset)
        : 0,
      endOffset: endsHere
        ? measureFromParagraphStart(paragraph, range.endContainer, range.endOffset)
        : (paragraph.textContent ?? "").length,
    });
  }
  if (!slices.length) return null;

  // 去掉选区首尾空白，同时保持段落绝对偏移。
  const first = slices[0];
  const leading = first.text.length - first.text.trimStart().length;
  if (leading > 0) {
    first.text = first.text.slice(leading);
    first.startOffset += leading;
  }
  const last = slices[slices.length - 1];
  const trailing = last.text.length - last.text.trimEnd().length;
  if (trailing > 0) {
    last.text = last.text.slice(0, last.text.length - trailing);
    last.endOffset -= trailing;
  }

  const nonEmpty = slices.filter((slice) => slice.text.trim().length > 0);
  if (!nonEmpty.length) return null;

  const start: TextAnchor = {
    paragraph: nonEmpty[0].index,
    offset: nonEmpty[0].startOffset,
  };
  const endSlice = nonEmpty[nonEmpty.length - 1];
  const end: TextAnchor = {
    paragraph: endSlice.index,
    offset: endSlice.endOffset,
  };
  if (start.paragraph === end.paragraph && end.offset <= start.offset) {
    return null;
  }

  return {
    text: nonEmpty.map((slice) => slice.text).join("\n\n"),
    start,
    end,
    paragraphs: nonEmpty.map((slice) => ({
      index: slice.index,
      text: slice.text,
    })),
    rect: rangeRect(range),
  };
}

/** 点击词表标记时，不依赖当前 Selection，直接构造单词选区。 */
export function wordSelectionFromMark(
  paragraph: HTMLElement,
  mark: HTMLElement,
): CapturedSelection | null {
  const index = Number(paragraph.dataset.i);
  const raw = mark.textContent ?? "";
  const word = raw.trim();
  if (!Number.isFinite(index) || !isSingleWord(word)) return null;

  const before = document.createRange();
  before.setStart(paragraph, 0);
  before.setEndBefore(mark);
  const startOffset = before.toString().length;
  const rect = mark.getBoundingClientRect();

  return {
    text: word,
    start: { paragraph: index, offset: startOffset },
    end: { paragraph: index, offset: startOffset + raw.length },
    paragraphs: [{ index, text: word }],
    rect: {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    },
  };
}