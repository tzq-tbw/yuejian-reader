PRAGMA foreign_keys = ON;

CREATE TABLE suites (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    source      TEXT NOT NULL DEFAULT 'pdf',
    exam_level  TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE articles (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    suite_id      TEXT REFERENCES suites(id) ON DELETE SET NULL,
    title         TEXT NOT NULL,
    paragraphs    TEXT NOT NULL,
    topic         TEXT NOT NULL DEFAULT '未分类',
    exam_type     TEXT,
    sequence_no   INTEGER,
    page_range    TEXT,
    question_range TEXT,
    question_area TEXT,
    version       INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_articles_suite ON articles(suite_id, sequence_no);
CREATE INDEX idx_articles_title ON articles(title);

CREATE TABLE reading_sections (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE section_articles (
    section_id  TEXT NOT NULL REFERENCES reading_sections(id) ON DELETE CASCADE,
    article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    added_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (section_id, article_id)
);

CREATE INDEX idx_section_articles_order ON section_articles(section_id, position);