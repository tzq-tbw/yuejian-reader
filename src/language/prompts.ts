import type {
  ChatMessage,
  TextRequestInput,
  WordRequestInput,
} from "./types";

function paragraphBlocks(paragraphs: Array<{ index: number; text: string }>): string {
  return paragraphs
    .map((paragraph) => `[第 ${paragraph.index + 1} 段] ${paragraph.text}`)
    .join("\n\n");
}

/**
 * 词卡提示词：语境义由模型判断，常见义与词形按词条给出。
 * 原句和段落由本地按选区位置截取，避免模型自行编造。
 */
export function buildWordCardMessages(input: WordRequestInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是中国大学英语四级精读助手。",
        "根据给定的单词、原句和所在段落，判断该词在本处的具体含义。",
        "只输出一个 JSON 对象，不要 Markdown、代码围栏或额外说明。",
        "字段：",
        "word：选中的单词原形；",
        "phonetic：音标，可留空字符串；",
        "partOfSpeech：此处词性，如 n. / v. / adj.；",
        "contextualMeaning（语境义）：该词在本句语境中的简体中文释义，要具体到本处用法；",
        "commonMeaning（常见义）：该词的常见简体中文释义，简短；",
        "forms（词形）：词形变化或派生词字符串数组，如 \"复数: ...\"、\"过去式: ...\"，没有则返回空数组。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `文章标题：${input.articleTitle}`,
        "",
        `所在段落：${input.paragraph}`,
        "",
        `原句：${input.sentence || input.paragraph}`,
        "",
        `选中的单词：${input.word}`,
        "",
        "请只依据以上语境返回 JSON。",
      ].join("\n"),
    },
  ];
}

export function buildTranslationMessages(input: TextRequestInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是英语四级精读翻译助手。",
        "把用户给出的英文准确、自然地翻译成简体中文。",
        "保留原文的段落顺序和段落划分；多个段落之间空一行。",
        "只输出译文，不要标题、解释、标注或 Markdown。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `文章标题：${input.articleTitle}`,
        "",
        "待翻译内容（按段落标记）：",
        paragraphBlocks(input.paragraphs) || input.text,
      ].join("\n"),
    },
  ];
}

/** 句法解析提示词：只列实际出现的成分，避免模型补出不存在的结构。 */
export function buildAnalysisMessages(input: TextRequestInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是英语句法分析助手，面向中国大学英语四级读者。",
        "分析所给英文选区的语法结构，用简体中文说明。",
        "只输出一个 JSON 对象，不要 Markdown、代码围栏或额外说明。",
        "字段：",
        "trunk：字符串，语法主干，说明主语、谓语、宾语等核心成分；",
        "clauses：数组，每项 {\"text\":\"从句原文\",\"explanation\":\"从句类型与作用\"}；",
        "modifiers：字符串数组，每项说明一个实际出现的修饰关系；",
        "collocations：数组，每项 {\"phrase\":\"短语\",\"meaning\":\"中文含义\"}。",
        "只列出原文中实际出现的结构；没有的字段返回空字符串或空数组。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `文章标题：${input.articleTitle}`,
        "",
        "待解析选区：",
        paragraphBlocks(input.paragraphs) || input.text,
      ].join("\n"),
    },
  ];
}