import type { WordFavorite } from "../data/types";

export function firstCommonMeaning(commonMeaning: string): string {
  return commonMeaning.split(/[;；\r\n]/, 1)[0].trim();
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function wordFavoritesCsv(words: WordFavorite[]): string {
  const rows = [
    ["单词", "词性", "基本意思"],
    ...words.map((item) => [
      item.word,
      item.partOfSpeech ?? "",
      firstCommonMeaning(item.commonMeaning),
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
