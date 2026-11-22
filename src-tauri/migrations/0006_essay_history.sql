CREATE TABLE essay_documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_no INTEGER NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    text        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE essay_revisions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES essay_documents(id) ON DELETE CASCADE,
    revision_no INTEGER NOT NULL,
    text        TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (document_id, revision_no)
);

CREATE INDEX idx_essay_revisions_document
    ON essay_revisions(document_id, revision_no);
