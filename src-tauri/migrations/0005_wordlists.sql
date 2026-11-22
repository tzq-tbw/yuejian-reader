CREATE TABLE wordlists (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    source      TEXT NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    built_in    INTEGER NOT NULL DEFAULT 0 CHECK (built_in IN (0, 1)),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE wordlist_words (
    list_id     TEXT NOT NULL REFERENCES wordlists(id) ON DELETE CASCADE,
    word        TEXT NOT NULL COLLATE NOCASE,
    position    INTEGER NOT NULL,
    PRIMARY KEY (list_id, word)
);

CREATE INDEX idx_wordlist_words_lookup
    ON wordlist_words(list_id, word);

INSERT INTO wordlists (id, name, source, enabled, built_in) VALUES
    ('cet4', '四级高频', 'ECDICT · cet4 · 高频前 1600 词', 1, 1),
    ('cet6', '六级高频', 'ECDICT · cet6 · 高频前 1600 词', 1, 1),
    ('ky', '考研高频', 'ECDICT · 考研标签 · 高频前 1600 词', 1, 1);
