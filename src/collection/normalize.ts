/**
 * 收藏去重键的规范化：忽略英文大小写，合并连续空白。
 * 保留词序与标点；展示用快照仍保存收藏时的原始文本。
 */
export function normalizeCollectionKey(value: string): string {
  return value.trim().split(/\s+/).join(" ").toLowerCase();
}

export const normalizeWordForm = normalizeCollectionKey;
export const normalizeSentence = normalizeCollectionKey;