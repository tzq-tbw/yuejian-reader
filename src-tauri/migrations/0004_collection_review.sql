-- 阶段 4：生词本、长难句本、词语排程与复习事件。
-- 收藏保存当时的原文与模型结果快照；来源文章后续编辑不覆盖这些字段。

CREATE TABLE word_favorites (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    word                TEXT NOT NULL,
    normalized_word     TEXT NOT NULL,
    sentence            TEXT NOT NULL,
    normalized_sentence TEXT NOT NULL,
    article_id          INTEGER REFERENCES articles(id) ON DELETE SET NULL,
    article_title       TEXT NOT NULL,
    paragraph_start     INTEGER NOT NULL,
    paragraph_end       INTEGER NOT NULL,
    contextual_meaning  TEXT NOT NULL DEFAULT '',
    common_meaning      TEXT NOT NULL DEFAULT '',
    phonetic            TEXT,
    part_of_speech      TEXT,
    forms               TEXT NOT NULL DEFAULT '[]',
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 唯一键：规范化词形 + 规范化原句。规范化忽略大小写并合并空白。
CREATE UNIQUE INDEX idx_word_favorites_key
    ON word_favorites(normalized_word, normalized_sentence);
CREATE INDEX idx_word_favorites_created
    ON word_favorites(created_at, id);

CREATE TABLE long_sentence_favorites (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    source_text         TEXT NOT NULL,
    source_key          TEXT NOT NULL,
    translation         TEXT,
    analysis            TEXT,
    article_id          INTEGER REFERENCES articles(id) ON DELETE SET NULL,
    article_title       TEXT NOT NULL,
    paragraph_start     INTEGER NOT NULL,
    paragraph_end       INTEGER NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 同一篇文章、同一段落范围、同一原文只保留一条长难句。
CREATE UNIQUE INDEX idx_long_sentence_key
    ON long_sentence_favorites(source_key);
CREATE INDEX idx_long_sentence_created
    ON long_sentence_favorites(created_at, id);

CREATE TABLE review_schedules (
    favorite_id     INTEGER PRIMARY KEY REFERENCES word_favorites(id) ON DELETE CASCADE,
    stage           INTEGER NOT NULL DEFAULT 0,
    due_date        TEXT NOT NULL,
    last_reviewed_on TEXT,
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_review_schedules_due
    ON review_schedules(due_date);

CREATE TABLE review_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    favorite_id INTEGER NOT NULL REFERENCES word_favorites(id) ON DELETE CASCADE,
    round_id    TEXT NOT NULL,
    reveal_id   TEXT NOT NULL,
    rating      TEXT NOT NULL CHECK (rating IN ('remembered', 'forgotten')),
    local_date  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (reveal_id)
);

CREATE INDEX idx_review_events_favorite_date
    ON review_events(favorite_id, local_date);
CREATE INDEX idx_review_events_round
    ON review_events(round_id);