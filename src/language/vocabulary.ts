export interface VocabularyList {
  id: string;
  label: string;
  /** 是否收录该词（含常见屈折变化）。 */
  contains(word: string): boolean;
}

export interface VocabularyMatch {
  id: string;
  label: string;
}

export interface TextToken {
  text: string;
  word: boolean;
  matches: VocabularyMatch[];
}

/** 生成常见屈折形式的候选词，支持本地关键词式匹配。 */
function candidates(word: string): string[] {
  const base = word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (!base) return [];
  const forms = new Set<string>([base]);
  if (base.endsWith("'s") || base.endsWith("’s")) forms.add(base.slice(0, -2));
  if (base.endsWith("ies") && base.length > 4) forms.add(`${base.slice(0, -3)}y`);
  if (base.endsWith("es") && base.length > 3) forms.add(base.slice(0, -2));
  if (base.endsWith("s") && !base.endsWith("ss")) forms.add(base.slice(0, -1));
  if (base.endsWith("ing") && base.length > 5) {
    const stem = base.slice(0, -3);
    forms.add(stem);
    forms.add(`${stem}e`);
    if (/([a-z])\1$/.test(stem)) forms.add(stem.slice(0, -1));
  }
  if (base.endsWith("ed") && base.length > 4) {
    const stem = base.slice(0, -2);
    forms.add(stem);
    forms.add(base.slice(0, -1));
    if (/([a-z])\1$/.test(stem)) forms.add(stem.slice(0, -1));
  }
  return [...forms];
}

export function createVocabularyList(
  id: string,
  label: string,
  words: readonly string[],
): VocabularyList {
  const index = new Set(words);
  return {
    id,
    label,
    contains(word: string) {
      return candidates(word).some((candidate) => index.has(candidate));
    },
  };
}

export function vocabularyMatches(
  word: string,
  lists: readonly VocabularyList[] = [],
): VocabularyMatch[] {
  return lists
    .filter((list) => list.contains(word))
    .map((list) => ({ id: list.id, label: list.label }));
}

const WORD_PATTERN = /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;

/** 把段落切成“词 / 非词”片段，保留原文所有字符，选区偏移不受标色影响。 */
export function tokenizeWithVocabulary(
  text: string,
  lists: readonly VocabularyList[] = [],
): TextToken[] {
  const tokens: TextToken[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(WORD_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, index), word: false, matches: [] });
    }
    const word = match[0];
    tokens.push({ text: word, word: true, matches: vocabularyMatches(word, lists) });
    lastIndex = index + word.length;
  }
  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), word: false, matches: [] });
  }
  return tokens;
}
