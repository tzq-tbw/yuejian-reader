-- 升级为已有用户建立默认分区，保留原有文章在阅读列表中的可见性。
-- 重复启动不会重新加回已从分区移除的文章：本迁移只按版本执行一次。

INSERT OR IGNORE INTO reading_sections (id, name, sort_order)
VALUES ('default', '我的阅读', 10);

INSERT OR IGNORE INTO section_articles (section_id, article_id, position, added_at)
SELECT 'default', a.id, ROW_NUMBER() OVER (ORDER BY a.id), a.created_at
FROM articles a
WHERE NOT EXISTS (
    SELECT 1 FROM section_articles sa
    WHERE sa.section_id = 'default' AND sa.article_id = a.id
);