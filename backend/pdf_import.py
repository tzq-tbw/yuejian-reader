import re
from io import BytesIO

from pypdf import PdfReader


def before_marker(text, pattern):
    marker = re.search(pattern, text)
    if not marker:
        raise ValueError("正文与题目之间的分界不清晰，请检查 PDF 或粘贴正文。")
    return text[:marker.start()]


def split_exam(text):
    # shortcut: section headings and question numbers must survive text extraction.
    sections = list(re.finditer(r"(?im)^\s*Section[ \t]+([ABC])\b[^\n]*", text))
    for index in range(len(sections) - 2):
        a, b, c = sections[index:index + 3]
        if [m[1].upper() for m in (a, b, c)] == ["A", "B", "C"]:
            break
    else:
        raise ValueError("未找到连续的阅读 Section A、B、C，请检查 PDF 或粘贴正文。")

    a_text = text[a.end():b.start()]
    b_text = text[b.end():c.start()]
    c_text = re.split(r"(?im)^[ \t]*Part[ \t]+[IVX]+\b", text[c.end():], maxsplit=1)[0]

    # The vocabulary list often prints two columns on the same line.
    a_text = before_marker(a_text, r"(?im)^[ \t]*(?:A\s*[)）.]|Word Bank\b)")
    b_text = before_marker(b_text, r"(?m)^[ \t]*36\s*[.．、)）]")
    passages = re.split(r"(?im)^[ \t]*Passage[ \t]+(?:One|Two|[12])\b[^\n]*", c_text)
    if len(passages) != 3:
        raise ValueError("未识别出仔细阅读的 Passage One 和 Passage Two。")

    bodies = [a_text, b_text]
    for passage, question in zip(passages[1:], (46, 51)):
        bodies.append(before_marker(passage, rf"(?m)^[ \t]*{question}\s*[.．、)）]"))

    articles = []
    for title, body in zip(("选词填空", "长篇匹配", "仔细阅读 · 1", "仔细阅读 · 2"), bodies):
        body = re.sub(r"(?is)^.*?are based on (?:the following passage|the passage below)\s*[.:：]?\s*", "", body, count=1)
        body = re.sub(r"(?im)^[ \t]*Directions:[^\n]*\n?", "", body)
        body = re.sub(r"(?m)^[ \t]*([A-Z]\])", r"\n\1", body).strip()
        if len(re.findall(r"[A-Za-z]+", body)) < 25:
            raise ValueError(f"{title}提取的文字太少，请检查 PDF 或粘贴正文。")
        articles.append((title, body))
    return articles


def read_exam(data):
    try:
        reader = PdfReader(BytesIO(data))
        if len(reader.pages) > 60:
            raise ValueError("PDF 超过 60 页，请先拆成单套试卷。")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except ValueError:
        raise
    except Exception as error:
        raise ValueError("无法读取 PDF，请检查文件是否损坏或加密。") from error
    return split_exam(text)
