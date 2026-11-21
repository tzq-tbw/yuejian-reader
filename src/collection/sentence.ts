/**
 * 长难句收藏的选区判定。
 * 完整单句直接收藏；多句、整段或跨段选区先确认。
 */

const SENTENCE_BOUNDARY = /[.!?]+["'”’)\]]*(?=\s|$)/g;

/** 选区是否恰好是一个以句末标点收尾的完整单句。 */
export function isCompleteSingleSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const matches = Array.from(trimmed.matchAll(SENTENCE_BOUNDARY));
  if (matches.length !== 1) return false;
  const match = matches[0];
  return (match.index ?? 0) + match[0].length === trimmed.length;
}

export function sentenceCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Array.from(trimmed.matchAll(SENTENCE_BOUNDARY)).length;
}

/** 多句、整段或跨段点收藏时需要二次确认。 */
export function shouldConfirmLongSentence(
  text: string,
  paragraphStart: number,
  paragraphEnd: number,
): boolean {
  if (paragraphStart !== paragraphEnd) return true;
  if (text.includes("\n\n")) return true;
  return !isCompleteSingleSentence(text);
}

/**
 * 短语候选：同一段内、没有句末标点、2–8 个词且不超过 80 字符。
 * 用于把短语翻译收进生词本，而不是误收成长难句。
 */
export function isPhraseSelection(
  text: string,
  paragraphStart: number,
  paragraphEnd: number,
): boolean {
  const trimmed = text.trim();
  if (!trimmed || paragraphStart !== paragraphEnd) return false;
  if (trimmed.includes("\n") || /[.!?]/.test(trimmed)) return false;
  if (trimmed.length > 80) return false;
  const words = trimmed.split(/\s+/);
  return words.length >= 2 && words.length <= 8;
}