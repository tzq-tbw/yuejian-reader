from pathlib import Path
import sqlite3
from contextlib import closing
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from backend.analysis import analyze
from backend.pdf_import import read_exam

ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / "reader.sqlite3"
app = FastAPI(title="英语精读")


class ArticleInput(BaseModel):
    title: str
    body: str


Kind = Literal["word", "sentence"]


class FavoriteInput(BaseModel):
    kind: Kind
    target: str = Field(max_length=4000)
    original_sentence: str = Field(max_length=4000)
    meaning: str = Field(max_length=16000)


class AnalysisInput(BaseModel):
    mode: Literal["word", "translation", "syntax"]
    selection: str = Field(min_length=1, max_length=30000)
    context: str = Field(default="", max_length=8000)


def connect():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    db.execute("""CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY, kind TEXT NOT NULL, target TEXT NOT NULL,
        original_sentence TEXT NOT NULL, meaning TEXT NOT NULL
    )""")
    return db


@app.get("/api/articles")
def list_articles():
    with closing(connect()) as db:
        rows = db.execute("SELECT id, title, body FROM articles ORDER BY id DESC")
        return [dict(row) for row in rows]


@app.post("/api/articles", status_code=201)
def add_article(article: ArticleInput):
    title = article.title.strip()
    body = article.body.strip()
    if not title or not body:
        raise HTTPException(400, "标题和正文都需要填写")
    with closing(connect()) as db, db:
        row = db.execute(
            "INSERT INTO articles (title, body) VALUES (?, ?)", (title, body)
        )
        return {"id": row.lastrowid}


@app.patch("/api/articles/{article_id}")
def edit_article(article_id: int, article: ArticleInput):
    title, body = article.title.strip(), article.body.strip()
    if not title or not body:
        raise HTTPException(400, "标题和正文都需要填写")
    with closing(connect()) as db, db:
        row = db.execute("UPDATE articles SET title = ?, body = ? WHERE id = ?", (title, body, article_id))
        if not row.rowcount:
            raise HTTPException(404, "找不到这篇文章")
    return {"id": article_id}


@app.post("/api/import/pdf", status_code=201)
async def import_pdf(request: Request):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 12 * 1024 * 1024:
            raise HTTPException(413, "PDF 超过 12 MB")
    try:
        articles = await run_in_threadpool(read_exam, bytes(data))
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    with closing(connect()) as db, db:
        # The library lists newest IDs first, so insert the last passage first.
        db.executemany("INSERT INTO articles (title, body) VALUES (?, ?)", reversed(articles))
    return {"count": len(articles)}


@app.post("/api/analysis")
def analyze_text(payload: AnalysisInput):
    selection = payload.selection.strip()
    if not selection:
        raise HTTPException(400, "请选择要解析的文字")
    return {"text": analyze(payload.mode, selection, payload.context)}


@app.get("/api/favorites")
def list_favorites(kind: Kind):
    with closing(connect()) as db:
        rows = db.execute("SELECT * FROM favorites WHERE kind = ? ORDER BY id", (kind,))
        return [dict(row) for row in rows]


@app.post("/api/favorites")
def add_favorite(item: FavoriteInput):
    target = item.target.strip()
    sentence = item.original_sentence.strip()
    meaning = item.meaning.strip()
    if not target or not sentence or not meaning:
        raise HTTPException(400, "收藏需要目标、原句和解释")
    if item.kind == "sentence":
        target = sentence
    with closing(connect()) as db, db:
        # Hold the write lock across the duplicate check and insert.
        db.execute("BEGIN IMMEDIATE")
        existing = db.execute(
            """SELECT id FROM favorites
               WHERE kind = ? AND original_sentence = ?
               AND (target = ? COLLATE NOCASE AND kind = 'word'
                    OR target = ? AND kind = 'sentence')
               ORDER BY id LIMIT 1""",
            (item.kind, sentence, target, target),
        ).fetchone()
        if existing:
            return {"id": existing["id"], "created": False}
        row = db.execute(
            "INSERT INTO favorites (kind, target, original_sentence, meaning) VALUES (?, ?, ?, ?)",
            (item.kind, target, sentence, meaning),
        )
        return {"id": row.lastrowid, "created": True}


app.mount("/", StaticFiles(directory=ROOT / "frontend", html=True), name="web")
