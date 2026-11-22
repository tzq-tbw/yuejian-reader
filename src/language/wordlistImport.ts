function firstCsvField(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith('"')) {
    let field = "";
    for (let index = 1; index < trimmed.length; index += 1) {
      const character = trimmed[index];
      if (character === '"') {
        if (trimmed[index + 1] === '"') {
          field += '"';
          index += 1;
          continue;
        }
        break;
      }
      field += character;
    }
    return field;
  }
  const field = (trimmed.split(",", 1)[0] ?? "").trim().replace(/^"|"$/g, "");
  return trimmed.includes(",") ? field : field.split(/\s+/, 1)[0];
}

export function parseWordlist(content: string): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) return;
    const candidate = firstCsvField(trimmed).trim().toLowerCase();
    if (index === 0 && ["word", "words", "vocabulary"].includes(candidate)) return;
    const valid =
      candidate.length > 0 &&
      candidate.length <= 64 &&
      /^[a-z'-]+$/.test(candidate) &&
      /[a-z]/.test(candidate);
    if (valid && !seen.has(candidate)) {
      seen.add(candidate);
      words.push(candidate);
    }
  });
  if (!words.length) {
    throw new Error("文件中没有可导入的英文单词；请使用一行一词或首列为单词的 CSV");
  }
  if (words.length > 100_000) throw new Error("单个词表最多导入 100000 个单词");
  return words;
}
