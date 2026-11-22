export type OnlineWordlistFormat = "cet4-frequency" | "cet6-markdown" | "postgraduate-comma";

export const ONLINE_WORDLIST_SOURCES: Array<{
  format: OnlineWordlistFormat;
  label: string;
  name: string;
  url: string;
}> = [
  {
    format: "cet4-frequency",
    label: "四级词频 CSV",
    name: "四级在线高频",
    url: "https://raw.githubusercontent.com/yiyisheh/CET4-vocabulary/main/output/high_freq_surface_df.csv",
  },
  {
    format: "cet6-markdown",
    label: "六级 Markdown 表",
    name: "六级在线核心 500",
    url: "https://raw.githubusercontent.com/wangjiuyi543-ui/cet6-vocabulary/main/cet6_core_words_top500_simple.md",
  },
  {
    format: "postgraduate-comma",
    label: "考研逗号词表",
    name: "考研在线高频",
    url: "https://raw.githubusercontent.com/wyyxdgm/dc/master/dcb.txt",
  },
];

const CET4_FUNCTION_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
  "can", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from",
  "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself", "him", "himself",
  "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just", "me", "more", "most",
  "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once", "only", "or", "other", "our",
  "ours", "ourselves", "out", "over", "own", "same", "she", "should", "so", "some", "such", "than",
  "that", "the", "their", "theirs", "them", "themselves", "then", "there", "these", "they", "this",
  "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "were", "what", "when",
  "where", "which", "while", "who", "whom", "why", "will", "with", "you", "your", "yours", "yourself",
  "yourselves",
]);

function csvFields(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(field.trim());
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field.trim());
  return fields;
}

function wordCollector() {
  const seen = new Set<string>();
  const words: string[] = [];
  return {
    words,
    add(candidate: string, filter?: (word: string) => boolean) {
      const word = candidate.trim().toLowerCase();
      if (
        word.length === 0 || word.length > 64 || !/^[a-z'-]+$/.test(word) || !/[a-z]/.test(word) ||
        seen.has(word) || (filter && !filter(word))
      ) return;
      seen.add(word);
      words.push(word);
    },
  };
}

function parseCet4Frequency(content: string): string[] {
  const collector = wordCollector();
  for (const line of content.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [rankText, word] = csvFields(line);
    const rank = Number(rankText);
    if (!Number.isInteger(rank) || rank < 1 || rank > 1200 || !word) continue;
    collector.add(word, (candidate) => !CET4_FUNCTION_WORDS.has(candidate));
  }
  return collector.words;
}

function parseCet6Markdown(content: string): string[] {
  const collector = wordCollector();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed.split("|").map((cell) => cell.trim());
    const sequence = cells[1] ?? "";
    const word = (cells[2] ?? "").replace(/\*\*|__|`/g, "").trim();
    if (!/^\d+$/.test(sequence)) continue;
    collector.add(word);
  }
  return collector.words;
}

function parsePostgraduateComma(content: string): string[] {
  const collector = wordCollector();
  for (const candidate of content.replace(/^\uFEFF/, "").split(/[,，\r\n]+/)) {
    collector.add(candidate);
  }
  return collector.words;
}

export function parseOnlineWordlist(content: string, format: OnlineWordlistFormat): string[] {
  const words = format === "cet4-frequency"
    ? parseCet4Frequency(content)
    : format === "cet6-markdown"
      ? parseCet6Markdown(content)
      : parsePostgraduateComma(content);
  if (!words.length) throw new Error("在线词表中没有可导入的英文单词，请核对来源格式");
  if (words.length > 100_000) throw new Error("单个词表最多导入 100000 个单词");
  return words;
}

export function validateRawGithubUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("请输入有效的 GitHub Raw URL");
  }
  if (url.protocol !== "https:" || url.hostname !== "raw.githubusercontent.com" || url.pathname.split("/").filter(Boolean).length < 4) {
    throw new Error("仅支持 https://raw.githubusercontent.com/ 开头的 Raw URL");
  }
  return url.toString();
}

export async function fetchOnlineWordlist(
  url: string,
  format: OnlineWordlistFormat,
  fetchImpl: typeof fetch = fetch,
): Promise<{ url: string; words: string[] }> {
  const validUrl = validateRawGithubUrl(url);
  let response: Response;
  try {
    response = await fetchImpl(validUrl);
  } catch {
    throw new Error("下载词表失败，请检查网络和 Raw URL");
  }
  if (!response.ok) throw new Error(`下载词表失败：HTTP ${response.status}`);
  const content = await response.text();
  if (content.length > 2_000_000) throw new Error("在线词表文件过大，请下载后使用本地导入");
  return { url: validUrl, words: parseOnlineWordlist(content, format) };
}
