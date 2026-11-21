import type {
  ExtractedDocument,
  ExtractedPage,
  RawPage,
  RawTextItem,
  TextLine,
  TextRun,
} from "./types";

/** 页眉页脚判定带：距页面上/下边缘的 PDF 单位。 */
const MARGIN = 36;

function itemX(item: RawTextItem): number {
  return item.transform[4] ?? 0;
}

function itemY(item: RawTextItem): number {
  return item.transform[5] ?? 0;
}

function lineTolerance(item: RawTextItem): number {
  return Math.max(3.5, Math.min(6, item.height * 0.4));
}

function buildLines(pageNumber: number, items: RawTextItem[]): TextLine[] {
  const usable = items.filter(
    (item) =>
      typeof item.str === "string" &&
      item.str.length > 0 &&
      Array.isArray(item.transform) &&
      item.transform.length >= 6,
  );
  const sorted = [...usable].sort((a, b) => itemY(b) - itemY(a) || itemX(a) - itemX(b));

  const groups: RawTextItem[][] = [];
  let current: RawTextItem[] = [];
  let currentY = 0;
  for (const item of sorted) {
    if (!current.length) {
      current = [item];
      currentY = itemY(item);
      continue;
    }
    if (Math.abs(itemY(item) - currentY) <= lineTolerance(item)) {
      current.push(item);
    } else {
      groups.push(current);
      current = [item];
      currentY = itemY(item);
    }
  }
  if (current.length) groups.push(current);

  const lines: TextLine[] = [];
  for (const group of groups) {
    const ordered = [...group].sort((a, b) => itemX(a) - itemX(b));
    const text = ordered
      .map((item) => item.str)
      .join("")
      .replace(/ /g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const runs: TextRun[] = ordered
      .filter((item) => item.str.trim().length > 0)
      .map((item) => ({
        text: item.str,
        x: itemX(item),
        width: item.width,
        height: item.height,
      }));
    const x = runs.length ? Math.min(...runs.map((run) => run.x)) : itemX(ordered[0]);
    lines.push({
      page: pageNumber,
      y: Math.max(...group.map(itemY)),
      x,
      text,
      runs,
    });
  }
  return lines.sort((a, b) => b.y - a.y || a.x - b.x);
}

/** 把 PDF.js 的原始文本块按页组织成“行 → 页 → 文档”。 */
export function buildDocument(pages: RawPage[]): ExtractedDocument {
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const extracted: ExtractedPage[] = ordered.map((page) => ({
    pageNumber: page.pageNumber,
    width: page.width,
    height: page.height,
    lines: buildLines(page.pageNumber, page.items),
  }));
  return { pageCount: extracted.length, pages: extracted };
}

function marginKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[0-9]+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 去掉重复页眉页脚：位于页面上下边缘、且在至少两页重复出现的行；
 * 纯页码行即使只出现一次也移除。正文边缘处的独有文字保留。
 */
export function stripRepeatedMargins(doc: ExtractedDocument): ExtractedDocument {
  const counts = new Map<string, number>();
  for (const page of doc.pages) {
    for (const line of page.lines) {
      const inMargin = line.y < MARGIN || line.y > page.height - MARGIN;
      if (!inMargin) continue;
      const key = marginKey(line.text);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return {
    pageCount: doc.pageCount,
    pages: doc.pages.map((page) => ({
      ...page,
      lines: page.lines.filter((line) => {
        const inMargin = line.y < MARGIN || line.y > page.height - MARGIN;
        if (!inMargin) return true;
        if (/^\d{1,3}$/.test(line.text.trim())) return false;
        return (counts.get(marginKey(line.text)) ?? 0) < 2;
      }),
    })),
  };
}

/** 拼接多行文字；行尾连字符与下一行小写开头合并为同一个词。 */
export function joinLineTexts(texts: string[]): string {
  let out = "";
  for (const raw of texts) {
    const text = raw.trim();
    if (!text) continue;
    if (!out) out = text;
    else if (/-$/.test(out) && /^[a-z]/.test(text)) out += text;
    else out += ` ${text}`;
  }
  return out.replace(/\s+/g, " ").trim();
}

export function joinLines(lines: TextLine[]): string {
  return joinLineTexts(lines.map((line) => line.text));
}

export function pagesInRange(lines: TextLine[]): number[] {
  return [...new Set(lines.map((line) => line.page))].sort((a, b) => a - b);
}

export function formatPageRange(lines: TextLine[]): string {
  const pages = pagesInRange(lines);
  if (!pages.length) return "";
  const first = pages[0];
  const last = pages[pages.length - 1];
  return first === last ? `${first}` : `${first}–${last}`;
}

export function formatNumberRange(numbers: number[]): string {
  if (!numbers.length) return "";
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  return min === max ? `${min}` : `${min}–${max}`;
}

/** 题型无法识别时，把整段文字按句末/页码切成可预览的段落。 */
export function buildParagraphs(lines: TextLine[]): string[] {
  const paragraphs: string[] = [];
  let current: TextLine[] = [];

  const flush = () => {
    if (!current.length) return;
    const text = joinLines(current);
    if (text) paragraphs.push(text);
    current = [];
  };

  for (const line of lines) {
    if (current.length) {
      const previousText = joinLines(current);
      const previousEndsSentence = /[.!?]["'”’)\]]*$/.test(previousText);
      const nextStartsSentence = /^[A-Z0-9"“'‘([\]]/.test(line.text);
      if (previousEndsSentence && nextStartsSentence) flush();
    }
    current.push(line);
  }
  flush();
  return paragraphs;
}