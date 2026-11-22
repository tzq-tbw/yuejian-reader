import type { ChatMessage } from "../language/types";

export function buildEssayReviewMessages(text: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是一名严谨的英语作文批改老师。检查作文中的语法错误、单词使用错误、拼写、时态和搭配问题，按严重程度与原文位置组织结果，并给出润色版。
只返回一个 JSON 对象，不要使用 Markdown 或代码围栏，结构如下：
{
  "issues": [{
    "severity": "high | medium | low",
    "category": "grammar | word | spelling | tense | collocation | other",
    "location": "第几段第几句及对应原文片段",
    "original": "有问题的原文",
    "suggestion": "建议改成的英文",
    "explanation": "简明中文说明"
  }],
  "polished": "保留原意和段落结构的完整英文润色版"
}
严重程度：影响理解或明显语法错误为 high，用词、时态和搭配问题为 medium，拼写与细节优化为 low。issues 先按严重程度、再按原文出现顺序排列；没有问题的方面不要编造。`,
    },
    { role: "user", content: text },
  ];
}
