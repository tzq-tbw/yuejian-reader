/**
 * 四级词表标色的本地样例。
 *
 * 完整词表后续接入；调用方只依赖 VocabularyList 接口，
 * 替换数据源时无需改正文渲染与选区逻辑。
 */

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

/** 内置样例词，覆盖阅读中常见词；完整 ECDICT 分级词表后补。 */
const CET4_SAMPLE_WORDS = [
  "ability", "accept", "account", "achieve", "across", "activity", "address",
  "admit", "advantage", "advice", "affect", "afraid", "against", "agree",
  "allow", "almost", "already", "although", "always", "amount", "ancient",
  "animal", "answer", "approach", "argue", "around", "arrive", "article",
  "attend", "attention", "author", "available", "average", "avoid", "aware",
  "balance", "bank", "basic", "beauty", "because", "become", "before",
  "begin", "behaviour", "believe", "benefit", "between", "beyond", "building",
  "business", "camera", "career", "carry", "cause", "center", "central",
  "century", "certain", "challenge", "change", "character", "charge",
  "choice", "choose", "city", "classroom", "climate", "college", "common",
  "community", "company", "compare", "complete", "concern", "condition",
  "connect", "consider", "contain", "continue", "control", "country",
  "course", "create", "culture", "current", "custom", "damage", "danger",
  "decide", "declare", "decline", "deep", "degree", "demand", "describe",
  "design", "detail", "develop", "difference", "different", "difficult",
  "digital", "direct", "discover", "discuss", "disease", "distance",
  "divide", "doctor", "doubt", "during", "early", "economy", "education",
  "effect", "effort", "either", "employ", "employee", "energy", "engine",
  "enough", "ensure", "enter", "environment", "especially", "establish",
  "even", "event", "evidence", "exact", "example", "exist", "expect",
  "experience", "explain", "express", "extend", "eye", "face", "factor",
  "fail", "family", "famous", "father", "feeling", "field", "figure",
  "final", "financial", "find", "follow", "foot", "force", "foreign",
  "forest", "forget", "form", "former", "free", "friend", "future",
  "garden", "general", "government", "great", "green", "ground", "group",
  "grow", "habit", "happen", "health", "heart", "heavy", "help", "history",
  "home", "hope", "hospital", "human", "idea", "identify", "important",
  "improve", "include", "increase", "indeed", "industry", "information",
  "inside", "instead", "interest", "international", "introduce", "involve",
  "issue", "join", "keep", "kind", "knowledge", "language", "large",
  "last", "later", "laugh", "lead", "learn", "leave", "legal", "level",
  "life", "light", "likely", "listen", "little", "live", "local", "long",
  "look", "lose", "love", "main", "maintain", "major", "manage", "many",
  "market", "matter", "maybe", "mean", "measure", "media", "medical",
  "member", "memory", "mention", "method", "middle", "might", "military",
  "million", "mind", "minute", "modern", "moment", "money", "month",
  "moral", "more", "morning", "most", "mother", "move", "music", "name",
  "nation", "natural", "nature", "near", "need", "network", "never",
  "news", "next", "night", "number", "object", "offer", "office", "often",
  "online", "only", "open", "order", "other", "outside", "parent",
  "part", "particular", "party", "past", "patient", "pattern", "people",
  "perhaps", "period", "person", "picture", "place", "plan", "plant",
  "point", "policy", "popular", "position", "possible", "power",
  "practice", "prepare", "present", "pressure", "prevent", "price",
  "private", "probably", "problem", "process", "produce", "product",
  "program", "project", "protect", "provide", "public", "purpose",
  "quality", "question", "quick", "quite", "raise", "rather", "reach",
  "read", "ready", "real", "reason", "receive", "recent", "recognize",
  "record", "reduce", "reflect", "region", "relate", "remain", "remember",
  "report", "represent", "require", "research", "resource", "respond",
  "result", "return", "right", "river", "road", "role", "room", "rule",
  "run", "safe", "same", "save", "school", "science", "season", "second",
  "seem", "sell", "send", "sense", "series", "serious", "serve", "service",
  "several", "share", "short", "should", "show", "side", "sign", "similar",
  "simple", "since", "single", "site", "situation", "size", "skill",
  "small", "social", "society", "some", "sometimes", "space", "special",
  "species", "spend", "sport", "spring", "stand", "start", "state",
  "station", "stay", "step", "still", "stock", "stop", "story", "street",
  "strong", "structure", "student", "study", "subject", "success", "such",
  "suggest", "summer", "support", "sure", "surface", "system", "table",
  "take", "talk", "teach", "teacher", "team", "technology", "tell",
  "term", "test", "than", "thank", "that", "their", "them", "then",
  "there", "these", "they", "thing", "think", "third", "this", "those",
  "though", "thought", "three", "through", "throw", "time", "today",
  "together", "tonight", "total", "town", "trade", "traditional", "train",
  "travel", "treat", "tree", "trial", "trip", "trouble", "true", "trust",
  "truth", "try", "turn", "type", "under", "understand", "until", "upon",
  "urban", "use", "usual", "value", "various", "very", "view", "village",
  "visit", "voice", "wait", "walk", "want", "watch", "water", "way",
  "weak", "wear", "weather", "week", "weight", "welcome", "well", "west",
  "what", "when", "where", "whether", "which", "while", "white", "who",
  "whole", "why", "wide", "wife", "will", "win", "wind", "window",
  "winter", "with", "within", "without", "woman", "wonder", "word", "work",
  "worker", "world", "worry", "would", "write", "writer", "wrong", "year",
  "young",
] as const;

const CET4_INDEX = new Set<string>(CET4_SAMPLE_WORDS);

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

export const CET4_SAMPLE_LIST: VocabularyList = {
  id: "cet4",
  label: "四级词汇",
  contains(word: string) {
    return candidates(word).some((candidate) => CET4_INDEX.has(candidate));
  },
};

/** 后续六级、考研词表直接追加；正文会同时标出所有命中的类别。 */
export const DEFAULT_VOCABULARY_LISTS: readonly VocabularyList[] = [
  CET4_SAMPLE_LIST,
];

export function vocabularyMatches(
  word: string,
  lists: readonly VocabularyList[] = DEFAULT_VOCABULARY_LISTS,
): VocabularyMatch[] {
  return lists
    .filter((list) => list.contains(word))
    .map((list) => ({ id: list.id, label: list.label }));
}

const WORD_PATTERN = /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;

/** 把段落切成“词 / 非词”片段，保留原文所有字符，选区偏移不受标色影响。 */
export function tokenizeWithVocabulary(
  text: string,
  lists: readonly VocabularyList[] = DEFAULT_VOCABULARY_LISTS,
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