import type { ArticleDetail } from "../data/types";
import type {
  ReadingOperation,
  ReadingTarget,
  SelectionInput,
} from "./types";

type TargetArticle = Pick<ArticleDetail, "id" | "version" | "paragraphs">;

/** 由选区构造请求目标；文章 ID、版本、起止和操作类别在此一次性固定。 */
export function selectionTarget(
  article: TargetArticle,
  operation: ReadingOperation,
  selection: SelectionInput,
): ReadingTarget {
  return {
    articleId: article.id,
    version: article.version,
    operation,
    start: { ...selection.start },
    end: { ...selection.end },
    paragraphs: selection.paragraphs.map((paragraph) => paragraph.index),
    text: selection.text,
  };
}

export function paragraphTarget(
  article: TargetArticle,
  index: number,
): ReadingTarget {
  const text = article.paragraphs[index] ?? "";
  return {
    articleId: article.id,
    version: article.version,
    operation: "paragraph",
    start: { paragraph: index, offset: 0 },
    end: { paragraph: index, offset: text.length },
    paragraphs: [index],
    text,
  };
}

export function articleTarget(article: TargetArticle): ReadingTarget {
  const lastIndex = Math.max(article.paragraphs.length - 1, 0);
  const lastText = article.paragraphs[lastIndex] ?? "";
  return {
    articleId: article.id,
    version: article.version,
    operation: "article",
    start: { paragraph: 0, offset: 0 },
    end: { paragraph: lastIndex, offset: lastText.length },
    paragraphs: article.paragraphs.map((_, index) => index),
    text: article.paragraphs.join("\n\n"),
  };
}

/** 两个请求目标是否指向同一篇文章、同一版本和同一选区。 */
export function sameSelectionRange(a: ReadingTarget, b: ReadingTarget): boolean {
  return (
    a.articleId === b.articleId &&
    a.version === b.version &&
    a.start.paragraph === b.start.paragraph &&
    a.start.offset === b.start.offset &&
    a.end.paragraph === b.end.paragraph &&
    a.end.offset === b.end.offset &&
    a.paragraphs.join(",") === b.paragraphs.join(",") &&
    a.text === b.text
  );
}