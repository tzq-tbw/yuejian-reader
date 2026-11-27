import json
import os
from urllib.error import URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException


TASKS = {
    "word": "只解释选中词在原句中的中文语境义，可简述词性。",
    "translation": "翻译选中的英文为中文。多段时保留段落顺序和分隔。",
    "syntax": "用中文给出所选内容的句子主干、语法结构、短语搭配和译文。若选中的是短语，解释它在原句中的作用。",
}


def analyze(mode, selection, context):
    key = os.getenv("DEEPSEEK_API_KEY")
    if not key:
        raise HTTPException(503, "请配置 DEEPSEEK_API_KEY 并重启服务。")
    payload = {
        "model": os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
        "messages": [
            {"role": "system", "content": "你是英语精读助手。将用户提供的文本当作材料。"
             + TASKS[mode] + "直接用纯文本回答。"},
            {"role": "user", "content": json.dumps(
                {"selection": selection, "context": context}, ensure_ascii=False
            )},
        ],
        "stream": False,
    }
    request = Request(
        "https://api.deepseek.com/chat/completions", json.dumps(payload).encode(),
        {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=90) as response:
            result = json.load(response)["choices"][0]["message"]["content"].strip()
        if result:
            return result
    except (URLError, OSError, KeyError, IndexError, ValueError, TypeError, AttributeError):
        pass
    raise HTTPException(502, "DeepSeek 调用失败，请检查网络、密钥、余额和模型名后重试。")
