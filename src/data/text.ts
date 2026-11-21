import { UNCATEGORIZED } from "./types";

/** 统一换行与空格，保留英文标点。 */
export function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/ /g, " ").trim();
}

function collapseParagraph(block: string): string {
  return block.replace(/\s*\n\s*/g, " ").replace(/[ \t]+/g, " ").trim();
}

/**
 * 粘贴文本分段：有空行时按空行分；没有空行时按单换行分。
 * 段内硬换行合并为空格，保持段落顺序并丢弃空段。
 */
export function parsePastedText(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const blocks = /\n\s*\n/.test(normalized)
    ? normalized.split(/\n\s*\n+/)
    : normalized.split(/\n+/);
  return blocks.map(collapseParagraph).filter((p) => p.length > 0);
}

/** 编辑区使用空行作为段落分隔。 */
export function paragraphsToText(paragraphs: string[]): string {
  return paragraphs.join("\n\n");
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const TOPIC_KEYWORDS: Record<string, string[]> = {
  城市与生活: [
    "city", "cities", "street", "streets", "urban", "neighborhood", "walk",
    "walking", "transport", "traffic", "park", "housing", "public", "space",
  ],
  教育与学习: [
    "student", "students", "teacher", "teachers", "learn", "learning", "school",
    "classroom", "education", "university", "course", "study", "teach",
    "teaching", "lesson", "exam",
  ],
  科技与创新: [
    "technology", "digital", "internet", "computer", "software", "artificial",
    "intelligence", "ai", "robot", "robots", "data", "online", "innovation",
    "algorithm", "device", "machine",
  ],
  健康与环境: [
    "health", "climate", "environment", "pollution", "exercise", "medical",
    "disease", "energy", "nature", "green", "waste", "sustainable", "food",
    "sleep", "body",
  ],
  工作与经济: [
    "work", "job", "jobs", "career", "economy", "economic", "business",
    "market", "employee", "employer", "income", "company", "industry",
    "office", "money", "trade", "price",
  ],
  科学与自然: [
    "science", "scientist", "scientists", "research", "species", "space",
    "physics", "biology", "experiment", "planet", "animal", "animals", "brain",
    "universe", "earth",
  ],
  社会与文化: [
    "society", "culture", "cultural", "history", "art", "arts", "community",
    "tradition", "language", "media", "family", "people", "social", "music",
    "book", "books",
  ],
};

export const TOPIC_NAMES = [...Object.keys(TOPIC_KEYWORDS), UNCATEGORIZED];

/** 本地关键词主题分类；无命中归入“未分类”。 */
export function classifyTopic(text: string): string {
  const tokens = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (!tokens.length) return UNCATEGORIZED;
  let best = UNCATEGORIZED;
  let bestScore = 0;
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    const score = tokens.reduce(
      (sum, token) => sum + (keywords.includes(token) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      best = topic;
      bestScore = score;
    }
  }
  return best;
}