import {
  buildParagraphs,
  formatNumberRange,
  formatPageRange,
  joinLines,
  joinLineTexts,
  stripRepeatedMargins,
} from "./layout";
import type {
  CandidateArticle,
  ExtractedDocument,
  ImportedQuestion,
  ImportedStatement,
  ReadingAnalysis,
  TextLine,
  WordBankEntry,
} from "./types";

const SECTION_HEADING = /^\s*Section\s+([ABC])\s*$/i;
const PART_FOUR = /^\s*Part\s+IV\b/i;
const DIRECTIONS = /^\s*Directions\s*:/i;

/** 跳过 Directions 说明段；说明段之后的第一个大间距行视为正文起点。 */
export function skipDirections(lines: TextLine[]): TextLine[] {
  const start = lines.findIndex((line) => DIRECTIONS.test(line.text));
  if (start < 0) return lines;
  let index = start + 1;
  let previous = lines[start];
  while (index < lines.length) {
    const line = lines[index];
    const samePage = line.page === previous.page;
    const gap = samePage ? previous.y - line.y : Number.POSITIVE_INFINITY;
    if (gap > 30) break;
    previous = line;
    index += 1;
  }
  return lines.slice(index);
}

/** 在给定行范围内找 Section A/B/C 三块，要求顺序为 A → B → C。 */
export function splitReadingSections(
  lines: TextLine[],
): { A: TextLine[]; B: TextLine[]; C: TextLine[] } | null {
  let a = -1;
  let b = -1;
  let c = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const match = SECTION_HEADING.exec(lines[index].text.trim());
    if (!match) continue;
    const letter = match[1].toUpperCase();
    if (letter === "A" && a < 0) a = index;
    else if (letter === "B" && a >= 0 && b < 0) b = index;
    else if (letter === "C" && b >= 0 && c < 0) c = index;
  }
  if (a < 0 || b < 0 || c < 0) return null;
  return {
    A: lines.slice(a + 1, b),
    B: lines.slice(b + 1, c),
    C: lines.slice(c + 1),
  };
}

function isWordBankLine(text: string): boolean {
  return (text.match(/\b[A-O]\)\s*[A-Za-z]/g) ?? []).length >= 2;
}

function wordCount(text: string): number {
  return (text.match(/[A-Za-z]+/g) ?? []).length;
}

function appendText(existing: string, next: string): string {
  const left = existing.trim();
  const right = next.trim();
  if (!left) return right;
  if (!right) return left;
  if (/-$/.test(left) && /^[a-z]/.test(right)) return left + right;
  return `${left} ${right}`;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * 恢复选词填空空位。本样卷在文字层用 [26] 这样的方括号题号表示空位；
 * 若只有绘图线条/下划线，则按下划线数量顺序恢复题号并提示校对。
 */
export function recoverBlanks(paragraphs: string[]): {
  paragraphs: string[];
  blanks: number[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const collected: number[] = [];
  for (const paragraph of paragraphs) {
    const matches = paragraph.matchAll(/\[(\d{1,3})\]/g);
    for (const match of matches) collected.push(Number(match[1]));
  }

  let blanks = collected;
  if (!blanks.length) {
    const underscores = (paragraphs.join(" ").match(/_{2,}/g) ?? []).length;
    if (underscores) {
      blanks = Array.from({ length: underscores }, (_, index) => 26 + index);
      warnings.push(
        `文字层没有空位题号，已按 ${underscores} 个下划线顺序恢复为 ${formatNumberRange(blanks)}，请校对。`,
      );
    } else {
      warnings.push("未在文字层找到空位题号或下划线空位，首版无法确认空位，请预览校对。");
    }
  }

  if (
    blanks.length !== 10 ||
    Math.min(...blanks) !== 26 ||
    Math.max(...blanks) !== 35 ||
    blanks.some((number, index) => number !== 26 + index)
  ) {
    warnings.push(
      `空位题号识别为 ${blanks.length ? formatNumberRange(blanks) : "0 个"}，人工基准为 26–35 共 10 个，请校对。`,
    );
  }

  const withVisibleBlanks = paragraphs.map((paragraph) =>
    paragraph.replace(/\[(\d{1,3})\]/g, (_, number: string) => `[${number}] ________`),
  );
  return { paragraphs: withVisibleBlanks, blanks, warnings };
}

export function parseWordBank(lines: TextLine[]): {
  wordBank: WordBankEntry[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const joined = joinLines(lines);
  const entries = new Map<string, string>();
  for (const match of joined.matchAll(/\b([A-O])\)\s*([A-Za-z][A-Za-z'-]*)/g)) {
    const letter = match[1];
    if (!entries.has(letter)) entries.set(letter, match[2]);
  }
  const wordBank = [...entries.entries()]
    .map(([letter, word]) => ({ letter, word }))
    .sort((a, b) => a.letter.localeCompare(b.letter));
  const expected = Array.from({ length: 15 }, (_, index) => String.fromCharCode(65 + index));
  if (
    wordBank.length !== 15 ||
    wordBank.some((entry, index) => entry.letter !== expected[index])
  ) {
    warnings.push(
      `候选词识别为 ${wordBank.length} 个（${wordBank.map((entry) => entry.letter).join("") || "无"}），人工基准为 A–O 共 15 个，请校对。`,
    );
  }
  return { wordBank, warnings };
}

/** 解析 “1. 36. 陈述句” 形式的长篇匹配陈述，支持跨页续行。 */
export function parseStatements(lines: TextLine[]): {
  statements: ImportedStatement[];
  warnings: string[];
} {
  const statements: ImportedStatement[] = [];
  let current: ImportedStatement | null = null;

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    if (/^Statements\s*:?\s*$/i.test(text)) continue;

    const prefixed = /^(\d{1,2})\.\s*(\d{1,3})\.\s*(.*)$/.exec(text)
      ?? /^(\d{1,2})\.(\d{1,3})\.\s*(.*)$/.exec(text);
    const bare = /^(\d{1,3})\.\s+(.*)$/.exec(text);
    const bareNumber = bare ? Number(bare[1]) : null;

    if (prefixed) {
      current = { number: Number(prefixed[2]), text: prefixed[3].trim() };
      statements.push(current);
    } else if (bare && bareNumber !== null && bareNumber >= 36 && bareNumber <= 45) {
      current = { number: bareNumber, text: bare[2].trim() };
      statements.push(current);
    } else if (current) {
      current.text = appendText(current.text, text);
    }
  }

  for (const statement of statements) statement.text = collapse(statement.text);

  const warnings: string[] = [];
  if (!statements.length) {
    warnings.push("未识别到 36–45 的匹配陈述，请校对题目区。");
  } else if (
    statements.length !== 10 ||
    statements.some((statement, index) => statement.number !== 36 + index)
  ) {
    warnings.push(
      `匹配陈述识别为 ${statements.length} 条（${formatNumberRange(statements.map((statement) => statement.number))}），人工基准为 36–45 共 10 条，请校对。`,
    );
  }
  return { statements, warnings };
}

/** 解析仔细阅读题：题干可跨行、选项可跨页，续行并入当前题干或选项。 */
export function parseQuestions(lines: TextLine[]): {
  questions: ImportedQuestion[];
  warnings: string[];
} {
  const questions: ImportedQuestion[] = [];
  let current: ImportedQuestion | null = null;
  let currentOption: { letter: string; text: string } | null = null;

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;

    const questionMatch = /^(\d{1,3})\.\s+(.+)$/.exec(text);
    if (questionMatch) {
      current = { number: Number(questionMatch[1]), stem: questionMatch[2].trim(), options: [] };
      questions.push(current);
      currentOption = null;
      continue;
    }

    const optionMatch = /^([A-D])\)\s*(.*)$/.exec(text);
    if (optionMatch && current) {
      const letter = optionMatch[1];
      const existing = current.options.find((option) => option.letter === letter);
      if (existing) {
        existing.text = appendText(existing.text, optionMatch[2]);
        currentOption = existing;
      } else {
        const option = { letter, text: optionMatch[2].trim() };
        current.options.push(option);
        currentOption = option;
      }
      continue;
    }

    if (currentOption) {
      currentOption.text = appendText(currentOption.text, text);
    } else if (current) {
      current.stem = appendText(current.stem, text);
    }
  }

  for (const question of questions) {
    question.stem = collapse(question.stem);
    for (const option of question.options) option.text = collapse(option.text);
    question.options.sort((a, b) => a.letter.localeCompare(b.letter));
  }

  const warnings: string[] = [];
  if (!questions.length) {
    warnings.push("未识别到题目，请校对题目区。");
  }
  for (const question of questions) {
    const letters = question.options.map((option) => option.letter).join("");
    if (letters !== "ABCD") {
      warnings.push(`第 ${question.number} 题选项为 ${letters || "无"}，预期 A–D，请校对。`);
    }
    if (!question.stem) {
      warnings.push(`第 ${question.number} 题题干为空，请校对。`);
    }
  }
  return { questions, warnings };
}

/** 解析长篇匹配正文的 A)–L) 段落标记；续行和跨页行并入当前段落。 */
export function parseLetterParagraphs(lines: TextLine[]): {
  paragraphs: string[];
  letters: string[];
  warnings: string[];
} {
  const blocks: Array<{ letter: string; texts: string[] }> = [];
  for (const line of lines) {
    const match = /^([A-Z])\)\s*(.*)$/.exec(line.text.trim());
    if (match) {
      blocks.push({ letter: match[1], texts: [match[2]] });
    } else if (blocks.length) {
      blocks[blocks.length - 1].texts.push(line.text);
    }
  }

  if (!blocks.length) {
    return {
      paragraphs: buildParagraphs(lines),
      letters: [],
      warnings: ["未识别到 A)–L) 段落标记，已按行文顺序分段，请校对。"],
    };
  }

  const paragraphs = blocks
    .map((block) => `${block.letter}) ${joinLineTexts(block.texts)}`.trim())
    .filter(Boolean);
  const letters = blocks.map((block) => block.letter);
  const warnings: string[] = [];
  if (letters.some((letter, index) => letter !== String.fromCharCode(65 + index))) {
    warnings.push(`段落字母为 ${letters.join("")}，不是从 A 开始的连续字母，请校对。`);
  }
  return { paragraphs, letters, warnings };
}

function sectionAWarnings(paragraphs: string[]): string[] {
  const warnings: string[] = [];
  if (!paragraphs.length) warnings.push("选词填空正文为空，请校对。");
  else if (wordCount(paragraphs.join(" ")) < 40) {
    warnings.push("选词填空正文文字过少，可能未完整提取，请校对。");
  }
  return warnings;
}

export function parseSectionA(lines: TextLine[]): CandidateArticle {
  const content = skipDirections(lines);
  let wordBankStart = content.findIndex((line, index) => index > 0 && isWordBankLine(line.text));
  if (wordBankStart < 0) {
    wordBankStart = content.findIndex(
      (line, index) => index > 0 && /^A\)\s+[A-Za-z]/.test(line.text),
    );
  }
  const bodyLines = wordBankStart >= 0 ? content.slice(0, wordBankStart) : content;
  const wordBankLines = wordBankStart >= 0 ? content.slice(wordBankStart) : [];

  const rawParagraphs = buildParagraphs(bodyLines);
  const recovered = recoverBlanks(rawParagraphs);
  const wordBankResult = parseWordBank(wordBankLines);
  const blanks = recovered.blanks;
  const questionRange = formatNumberRange(blanks);
  const warnings = [
    ...sectionAWarnings(recovered.paragraphs),
    ...recovered.warnings,
    ...wordBankResult.warnings,
  ];
  if (!wordBankLines.length) warnings.push("未识别到 A–O 候选词表，请校对。");

  return {
    title: questionRange ? `选词填空（${questionRange}）` : "选词填空",
    examType: "选词填空",
    sequenceNo: 1,
    pageRange: formatPageRange([...bodyLines, ...wordBankLines]),
    questionRange,
    paragraphs: recovered.paragraphs,
    questionArea: {
      kind: "banked_cloze",
      blanks,
      wordBank: wordBankResult.wordBank,
    },
    warnings,
  };
}

export function parseSectionB(lines: TextLine[]): CandidateArticle {
  const content = skipDirections(lines);
  const statementsIndex = content.findIndex((line) => {
    const text = line.text.trim();
    return (
      /^Statements\s*:?\s*$/i.test(text) ||
      /^(?:\d{1,2}\.\s*)?(?:3[6-9]|4[0-5])\.\s+/.test(text)
    );
  });
  const beforeStatements = statementsIndex >= 0 ? content.slice(0, statementsIndex) : content;
  const hasStatementsHeading =
    statementsIndex >= 0 && /^Statements\s*:?\s*$/i.test(content[statementsIndex].text.trim());
  const statementLines =
    statementsIndex >= 0 ? content.slice(statementsIndex + (hasStatementsHeading ? 1 : 0)) : [];

  const hasTitle =
    beforeStatements.length > 0 && !/^([A-Z])\)\s*/.test(beforeStatements[0].text.trim());
  const titleLine = hasTitle ? beforeStatements[0] : null;
  const bodyLines = hasTitle ? beforeStatements.slice(1) : beforeStatements;

  const letterResult = parseLetterParagraphs(bodyLines);
  const statementResult = parseStatements(statementLines);
  const questionRange = formatNumberRange(statementResult.statements.map((item) => item.number));
  const warnings = [...letterResult.warnings, ...statementResult.warnings];
  if (!letterResult.paragraphs.length) warnings.push("长篇匹配正文为空，请校对。");

  return {
    title: titleLine?.text.trim() || (questionRange ? `长篇匹配（${questionRange}）` : "长篇匹配"),
    examType: "长篇匹配",
    sequenceNo: 2,
    pageRange: formatPageRange([
      ...(titleLine ? [titleLine] : []),
      ...bodyLines,
      ...statementLines,
    ]),
    questionRange,
    paragraphs: letterResult.paragraphs,
    questionArea: {
      kind: "matching",
      statements: statementResult.statements,
      paragraphLetters: letterResult.letters,
    },
    warnings,
  };
}

function parsePassage(
  heading: TextLine,
  lines: TextLine[],
  label: string,
  expectedStart: number,
  sequenceNo: number,
): CandidateArticle {
  const expectedEnd = expectedStart + 4;
  const questionStart = lines.findIndex((line) =>
    new RegExp(`^\\s*${expectedStart}\\.\\s`).test(line.text),
  );
  const bodyLines = questionStart >= 0 ? lines.slice(0, questionStart) : lines;
  const questionLines = questionStart >= 0 ? lines.slice(questionStart) : [];

  const paragraphs = buildParagraphs(bodyLines);
  const questionResult = parseQuestions(questionLines);
  const numbers = questionResult.questions.map((question) => question.number);
  const questionRange = formatNumberRange(numbers);
  const warnings = [...questionResult.warnings];

  if (!paragraphs.length) warnings.push(`${label}正文为空，请校对。`);
  else if (wordCount(paragraphs.join(" ")) < 40) {
    warnings.push(`${label}正文文字过少，可能未完整提取，请校对。`);
  }
  if (!questionLines.length) {
    warnings.push(`${label}未识别到 ${expectedStart}–${expectedEnd} 题目区，请校对。`);
  } else if (
    numbers.length !== 5 ||
    numbers.some((number, index) => number !== expectedStart + index)
  ) {
    warnings.push(
      `${label}题目识别为 ${numbers.length} 题（${formatNumberRange(numbers) || "无"}），人工基准为 ${expectedStart}–${expectedEnd} 共 5 题，请校对。`,
    );
  }

  return {
    title: `仔细阅读 · ${label}`,
    examType: "仔细阅读",
    sequenceNo,
    pageRange: formatPageRange([heading, ...lines]),
    questionRange,
    paragraphs,
    questionArea: { kind: "multiple_choice", questions: questionResult.questions },
    warnings,
  };
}

export function parseSectionC(lines: TextLine[]): CandidateArticle[] | null {
  const content = skipDirections(lines);
  const headings: Array<{ index: number; label: string }> = [];
  for (let index = 0; index < content.length; index += 1) {
    const match = /^Passage\s+(One|Two|1|2)\s*$/i.exec(content[index].text.trim());
    if (match) {
      const value = match[1].toLowerCase();
      headings.push({
        index,
        label: value === "one" || value === "1" ? "Passage One" : "Passage Two",
      });
    }
  }
  if (headings.length < 2) return null;

  const firstEnd = headings[1].index;
  const passages = [
    {
      heading: content[headings[0].index],
      lines: content.slice(headings[0].index + 1, firstEnd),
      label: headings[0].label,
      expectedStart: 46,
      sequenceNo: 3,
    },
    {
      heading: content[headings[1].index],
      lines: content.slice(headings[1].index + 1),
      label: headings[1].label,
      expectedStart: 51,
      sequenceNo: 4,
    },
  ];
  return passages.map((passage) =>
    parsePassage(
      passage.heading,
      passage.lines,
      passage.label,
      passage.expectedStart,
      passage.sequenceNo,
    ),
  );
}

function fallbackArticle(lines: TextLine[], reason: string): ReadingAnalysis {
  const paragraphs = buildParagraphs(lines);
  const pageRange = formatPageRange(lines);
  return {
    articles: [
      {
        title: "阅读部分（未识别题型）",
        examType: "未识别题型",
        sequenceNo: 1,
        pageRange,
        questionRange: "",
        paragraphs: paragraphs.length ? paragraphs : [joinLines(lines)].filter(Boolean),
        questionArea: { kind: "raw" },
        warnings: [reason, "已保留可提取的原文，请在预览中校对后再导入。"],
      },
    ],
    warnings: [reason],
  };
}

/**
 * 从带坐标的文字层拆出阅读文章：
 * Section A（选词填空）1 篇、Section B（长篇匹配）1 篇、Section C（仔细阅读）2 篇。
 * 任何一部分无法识别时，返回整段原文卡并在预览中提示校对。
 */
export function analyzeReadingDocument(input: ExtractedDocument): ReadingAnalysis {
  const doc = stripRepeatedMargins(input);
  const allLines = doc.pages.flatMap((page) => page.lines);
  const letterCount = (allLines.map((line) => line.text).join(" ").match(/[A-Za-z]/g) ?? [])
    .length;
  if (letterCount < 40) {
    throw new Error("这个 PDF 没有可提取的文字层。首版只支持带文字层的试卷 PDF。");
  }

  const readingStart = allLines.findIndex(
    (line) => /^\s*Part\s+III\b/i.test(line.text) && /reading\s+comprehension/i.test(line.text),
  );
  if (readingStart < 0) {
    return fallbackArticle(allLines, "未找到 Part III Reading Comprehension，无法识别阅读题型。");
  }
  const partFour = allLines.findIndex(
    (line, index) => index > readingStart && PART_FOUR.test(line.text),
  );
  const readingLines = allLines.slice(
    readingStart + 1,
    partFour > readingStart ? partFour : undefined,
  );
  const sections = splitReadingSections(readingLines);
  if (!sections) {
    return fallbackArticle(
      readingLines,
      "未完整识别阅读 Section A、B、C，无法按题型拆篇。",
    );
  }

  const sectionC = parseSectionC(sections.C);
  if (!sectionC) {
    return fallbackArticle(
      readingLines,
      "仔细阅读未识别出 Passage One 和 Passage Two，无法按篇拆分。",
    );
  }

  const articles = [
    parseSectionA(sections.A),
    parseSectionB(sections.B),
    ...sectionC,
  ];
  return { articles, warnings: [] };
}