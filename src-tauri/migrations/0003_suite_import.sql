-- 阶段 2：套卷指纹去重与一套卷内篇次唯一。
ALTER TABLE suites ADD COLUMN fingerprint TEXT;

CREATE UNIQUE INDEX idx_suites_fingerprint
    ON suites(fingerprint)
    WHERE fingerprint IS NOT NULL;

CREATE UNIQUE INDEX idx_articles_suite_sequence
    ON articles(suite_id, sequence_no)
    WHERE suite_id IS NOT NULL;