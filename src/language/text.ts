/** 选区与文本定位的纯工具，便于单元测试。 */

export function isSingleWord(text: string): boolean {
  return /^[A-Za-z]+(?:['’\-][A-Za-z]+)*$/.test(text.trim());
}

/**
 * 取包含指定段内偏移的原句。按 . ! ? 及收尾引号/括号切分，
 * 偏移落在句末标点时归入该句。
 */
export function sentenceAt(paragraph: string, offset: number): string {
  const text = paragraph.trim();
  if (!text) return "";
  const clamped = Math.max(0, Math.min(offset, paragraph.length));
  const boundary = /[.!?]+["'”’)\]]*(?=\s|$)/g;
  let start = 0;
  for (let match = boundary.exec(paragraph); match; match = boundary.exec(paragraph)) {
    const end = match.index + match[0].length;
    if (clamped <= end) {
      return paragraph.slice(start, end).trim();
    }
    start = end;
    while (start < paragraph.length && /\s/.test(paragraph[start])) start += 1;
  }
  return paragraph.slice(start).trim() || text;
}

/** 把段落内的字符偏移转换为原句。 */
export function sentenceAtOffset(paragraph: string, offset: number): string {
  return sentenceAt(paragraph, offset);
}