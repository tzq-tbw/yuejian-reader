use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// 对外数据结构（camelCase 与 src/data/types.ts 对应）
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    pub id: String,
    pub name: String,
    pub sort_order: i64,
    pub article_count: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleSummary {
    pub id: i64,
    pub title: String,
    pub topic: String,
    pub version: i64,
    pub paragraph_count: i64,
    pub word_count: i64,
    pub suite_id: Option<String>,
    pub suite_title: Option<String>,
    pub exam_type: Option<String>,
    pub sequence_no: Option<i64>,
    pub page_range: Option<String>,
    pub question_range: Option<String>,
    pub section_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleDetail {
    #[serde(flatten)]
    pub summary: ArticleSummary,
    pub paragraphs: Vec<String>,
    pub source: String,
    pub created_at: String,
    pub section_ids: Vec<String>,
    pub question_area: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateArticleInput {
    pub id: i64,
    pub title: String,
    pub topic: String,
    pub paragraphs: Vec<String>,
    pub expected_version: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasteArticleInput {
    pub title: String,
    pub text: String,
    #[serde(default)]
    pub topic: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportArticleInput {
    pub title: String,
    pub exam_type: String,
    pub sequence_no: i64,
    #[serde(default)]
    pub page_range: Option<String>,
    #[serde(default)]
    pub question_range: Option<String>,
    #[serde(default)]
    pub question_area: Option<String>,
    pub paragraphs: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSuiteInput {
    pub title: String,
    pub fingerprint: String,
    #[serde(default)]
    pub exam_level: Option<String>,
    pub articles: Vec<ImportArticleInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSuiteResult {
    pub suite_id: String,
    pub title: String,
    pub created: bool,
    pub articles: Vec<ArticleSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddResult {
    pub added: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryGroup {
    pub suite_id: Option<String>,
    pub title: String,
    pub source: String,
    pub articles: Vec<ArticleSummary>,
}

// ---------------------------------------------------------------------------
// 迁移
// ---------------------------------------------------------------------------

pub struct Migration {
    pub version: i64,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "core",
        sql: include_str!("../migrations/0001_core.sql"),
    },
    Migration {
        version: 2,
        name: "default_section",
        sql: include_str!("../migrations/0002_default_section.sql"),
    },
    Migration {
        version: 3,
        name: "suite_import",
        sql: include_str!("../migrations/0003_suite_import.sql"),
    },
];

pub fn run_migrations(conn: &mut Connection, migrations: &[Migration]) -> Result<usize, String> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         CREATE TABLE IF NOT EXISTS schema_migrations (
             version    INTEGER PRIMARY KEY,
             name       TEXT NOT NULL,
             applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         );",
    )
    .map_err(|e| format!("初始化迁移表失败：{e}"))?;

    let mut applied = 0;
    for migration in migrations {
        let exists: Option<i64> = conn
            .query_row(
                "SELECT version FROM schema_migrations WHERE version = ?1",
                params![migration.version],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if exists.is_some() {
            continue;
        }
        let tx = conn
            .transaction()
            .map_err(|e| format!("开始迁移事务失败：{e}"))?;
        tx.execute_batch(migration.sql)
            .map_err(|e| format!("迁移 {} 执行失败：{e}", migration.version))?;
        tx.execute(
            "INSERT INTO schema_migrations (version, name) VALUES (?1, ?2)",
            params![migration.version, migration.name],
        )
        .map_err(|e| e.to_string())?;
        tx.commit()
            .map_err(|e| format!("提交迁移 {} 失败：{e}", migration.version))?;
        applied += 1;
    }
    Ok(applied)
}

pub fn open(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建数据目录失败：{e}"))?;
    }
    let mut conn = Connection::open(path).map_err(|e| format!("打开数据库失败：{e}"))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )
    .map_err(|e| format!("配置数据库失败：{e}"))?;
    run_migrations(&mut conn, MIGRATIONS)?;
    Ok(conn)
}

// ---------------------------------------------------------------------------
// 查询
// ---------------------------------------------------------------------------

const SUMMARY_SELECT: &str = "
    SELECT a.id, a.title, a.topic, a.version, a.paragraphs,
           a.suite_id, s.title AS suite_title, a.exam_type, a.sequence_no,
           a.page_range, a.question_range, a.updated_at,
           (SELECT COUNT(*) FROM section_articles sa WHERE sa.article_id = a.id) AS section_count
    FROM articles a
    LEFT JOIN suites s ON s.id = a.suite_id";

fn row_to_summary(row: &Row<'_>) -> rusqlite::Result<ArticleSummary> {
    let raw: String = row.get(4)?;
    let paragraphs = parse_paragraphs_json(&raw);
    let paragraph_count = paragraphs.len() as i64;
    let word_count = paragraphs
        .iter()
        .map(|p| p.split_whitespace().count())
        .sum::<usize>() as i64;
    Ok(ArticleSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        topic: row.get(2)?,
        version: row.get(3)?,
        paragraph_count,
        word_count,
        suite_id: row.get(5)?,
        suite_title: row.get(6)?,
        exam_type: row.get(7)?,
        sequence_no: row.get(8)?,
        page_range: row.get(9)?,
        question_range: row.get(10)?,
        updated_at: row.get(11)?,
        section_count: row.get(12)?,
    })
}

fn parse_paragraphs_json(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw).unwrap_or_default()
}

fn section_result(conn: &Connection, id: &str) -> Result<Section, String> {
    conn.query_row(
        "SELECT rs.id, rs.name, rs.sort_order, rs.created_at,
                (SELECT COUNT(*) FROM section_articles sa WHERE sa.section_id = rs.id)
         FROM reading_sections rs WHERE rs.id = ?1",
        params![id],
        |row| {
            Ok(Section {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
                created_at: row.get(3)?,
                article_count: row.get(4)?,
            })
        },
    )
    .map_err(|_| "找不到这个分区".to_string())
}

fn section_exists(conn: &Connection, id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM reading_sections WHERE id = ?1",
        params![id],
        |row| row.get::<_, i64>(0),
    )
    .optional()
    .map(|row| row.is_some())
    .map_err(|e| e.to_string())
}

pub fn list_sections(conn: &Connection) -> Result<Vec<Section>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT rs.id, rs.name, rs.sort_order, rs.created_at,
                    (SELECT COUNT(*) FROM section_articles sa WHERE sa.section_id = rs.id)
             FROM reading_sections rs
             ORDER BY rs.sort_order, rs.created_at",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Section {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
                created_at: row.get(3)?,
                article_count: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

pub fn create_section(conn: &mut Connection, name: &str) -> Result<Section, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("分区名称不能为空".into());
    }
    let sort_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), 0) + 10 FROM reading_sections",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO reading_sections (id, name, sort_order) VALUES (?1, ?2, ?3)",
        params![id, name, sort_order],
    )
    .map_err(|e| format!("新建分区失败：{e}"))?;
    section_result(conn, &id)
}

pub fn rename_section(conn: &mut Connection, id: &str, name: &str) -> Result<Section, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("分区名称不能为空".into());
    }
    let changed = conn
        .execute(
            "UPDATE reading_sections
             SET name = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?2",
            params![name, id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("找不到这个分区".into());
    }
    section_result(conn, id)
}

pub fn list_section_articles(
    conn: &Connection,
    section_id: &str,
) -> Result<Vec<ArticleSummary>, String> {
    if !section_exists(conn, section_id)? {
        return Err("找不到这个分区".into());
    }
    let sql = format!(
        "{SUMMARY_SELECT}
         JOIN section_articles sa ON sa.article_id = a.id
         WHERE sa.section_id = ?1
         ORDER BY sa.position"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![section_id], row_to_summary)
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

pub fn list_library(conn: &Connection, search: Option<&str>) -> Result<Vec<LibraryGroup>, String> {
    let needle = search.unwrap_or("").trim().to_lowercase();
    let mut stmt = conn
        .prepare(&format!(
            "{SUMMARY_SELECT}
             ORDER BY a.sequence_no IS NULL, a.sequence_no, a.id DESC"
        ))
        .map_err(|e| e.to_string())?;
    let summaries: Vec<ArticleSummary> = stmt
        .query_map([], row_to_summary)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    let mut suites = Vec::new();
    {
        let mut suite_stmt = conn
            .prepare("SELECT id, title, source FROM suites ORDER BY sort_order, created_at")
            .map_err(|e| e.to_string())?;
        let rows = suite_stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            suites.push(row.map_err(|e| e.to_string())?);
        }
    }

    let mut groups: Vec<LibraryGroup> = Vec::new();
    for (suite_id, suite_title, source) in suites {
        let articles: Vec<ArticleSummary> = summaries
            .iter()
            .filter(|a| a.suite_id.as_deref() == Some(suite_id.as_str()))
            .filter(|a| needle.is_empty() || a.title.to_lowercase().contains(&needle))
            .cloned()
            .collect();
        if !articles.is_empty() {
            groups.push(LibraryGroup {
                suite_id: Some(suite_id),
                title: suite_title,
                source,
                articles,
            });
        }
    }
    let standalone: Vec<ArticleSummary> = summaries
        .iter()
        .filter(|a| a.suite_id.is_none())
        .filter(|a| needle.is_empty() || a.title.to_lowercase().contains(&needle))
        .cloned()
        .collect();
    if !standalone.is_empty() {
        groups.push(LibraryGroup {
            suite_id: None,
            title: "单篇材料".into(),
            source: "paste".into(),
            articles: standalone,
        });
    }
    Ok(groups)
}

fn list_suite_articles(
    conn: &Connection,
    suite_id: &str,
) -> Result<Vec<ArticleSummary>, String> {
    let sql = format!(
        "{SUMMARY_SELECT}
         WHERE a.suite_id = ?1
         ORDER BY a.sequence_no, a.id"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![suite_id], row_to_summary)
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

pub fn get_article(conn: &Connection, id: i64) -> Result<ArticleDetail, String> {
    let summary = conn
        .query_row(
            &format!("{SUMMARY_SELECT} WHERE a.id = ?1"),
            params![id],
            row_to_summary,
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "找不到这篇文章".to_string())?;
    let (raw, created_at, question_area): (String, String, Option<String>) = conn
        .query_row(
            "SELECT paragraphs, created_at, question_area FROM articles WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT section_id FROM section_articles WHERE article_id = ?1 ORDER BY position")
        .map_err(|e| e.to_string())?;
    let section_ids = stmt
        .query_map(params![id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    let source = if summary.suite_id.is_some() {
        "suite".to_string()
    } else {
        "paste".to_string()
    };
    Ok(ArticleDetail {
        summary,
        paragraphs: parse_paragraphs_json(&raw),
        source,
        created_at,
        section_ids,
        question_area,
    })
}

pub fn get_article_sections(conn: &Connection, article_id: i64) -> Result<Vec<Section>, String> {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT id FROM articles WHERE id = ?1",
            params![article_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Err("找不到这篇文章".into());
    }
    let mut stmt = conn
        .prepare(
            "SELECT rs.id, rs.name, rs.sort_order, rs.created_at,
                    (SELECT COUNT(*) FROM section_articles all_sa WHERE all_sa.section_id = rs.id)
             FROM reading_sections rs
             JOIN section_articles sa ON sa.section_id = rs.id
             WHERE sa.article_id = ?1
             ORDER BY rs.sort_order, rs.created_at",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![article_id], |row| {
            Ok(Section {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
                created_at: row.get(3)?,
                article_count: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// 写入
// ---------------------------------------------------------------------------

pub fn paste_article(
    conn: &mut Connection,
    title: &str,
    text: &str,
    topic: Option<&str>,
) -> Result<ArticleDetail, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("标题不能为空".into());
    }
    let paragraphs = parse_pasted_text(text);
    if paragraphs.is_empty() {
        return Err("正文不能为空，至少粘贴一段英文".into());
    }
    // 手填主题优先；空主题仍按正文自动分类。
    let topic = match topic.map(str::trim).filter(|topic| !topic.is_empty()) {
        Some(topic) => topic.to_string(),
        None => classify_topic(&paragraphs.join(" ")),
    };
    let raw = serde_json::to_string(&paragraphs).map_err(|e| e.to_string())?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO articles (title, paragraphs, topic) VALUES (?1, ?2, ?3)",
        params![title, raw, topic],
    )
    .map_err(|e| format!("保存文章失败：{e}"))?;
    let id = tx.last_insert_rowid();
    let default_section: Option<String> = tx
        .query_row(
            "SELECT id FROM reading_sections ORDER BY sort_order, created_at LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(section_id) = default_section {
        let position: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(position), 0) + 1 FROM section_articles WHERE section_id = ?1",
                params![section_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO section_articles (section_id, article_id, position) VALUES (?1, ?2, ?3)",
            params![section_id, id, position],
        )
        .map_err(|e| format!("加入默认分区失败：{e}"))?;
    }
    tx.commit().map_err(|e| format!("提交文章失败：{e}"))?;
    get_article(conn, id)
}

/// 一套试卷一次事务入库：套卷、全部阅读卡和默认分区成员一起提交。
/// 同一指纹再次导入时返回已有卡片，不再新增。
pub fn import_suite(
    conn: &mut Connection,
    input: &ImportSuiteInput,
) -> Result<ImportSuiteResult, String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("套卷名称不能为空".into());
    }
    let fingerprint = input.fingerprint.trim();
    if fingerprint.is_empty() {
        return Err("缺少试卷指纹，无法安全去重".into());
    }
    if input.articles.is_empty() {
        return Err("没有可导入的阅读文章".into());
    }
    if input.articles.len() > 20 {
        return Err("一次导入的文章过多".into());
    }

    struct PreparedArticle {
        title: String,
        exam_type: String,
        sequence_no: i64,
        page_range: Option<String>,
        question_range: Option<String>,
        question_area: Option<String>,
        paragraphs: Vec<String>,
        topic: String,
    }

    let mut prepared = Vec::with_capacity(input.articles.len());
    for (index, article) in input.articles.iter().enumerate() {
        let article_title = article.title.trim();
        if article_title.is_empty() {
            return Err(format!("第 {} 篇文章标题不能为空", index + 1));
        }
        let exam_type = article.exam_type.trim();
        if exam_type.is_empty() {
            return Err(format!("《{article_title}》缺少题型"));
        }
        if article.sequence_no <= 0 {
            return Err(format!("《{article_title}》篇次不合法"));
        }
        let paragraphs: Vec<String> = article
            .paragraphs
            .iter()
            .map(|paragraph| paragraph.split_whitespace().collect::<Vec<_>>().join(" "))
            .filter(|paragraph| !paragraph.is_empty())
            .collect();
        if paragraphs.is_empty() {
            return Err(format!("《{article_title}》正文为空"));
        }
        let question_area = match article.question_area.as_deref().map(str::trim) {
            Some(raw) if !raw.is_empty() => {
                let value: serde_json::Value = serde_json::from_str(raw)
                    .map_err(|_| format!("《{article_title}》题目区格式不合法"))?;
                Some(serde_json::to_string(&value).map_err(|e| e.to_string())?)
            }
            _ => None,
        };
        let topic = classify_topic(&paragraphs.join(" "));
        prepared.push(PreparedArticle {
            title: article_title.to_string(),
            exam_type: exam_type.to_string(),
            sequence_no: article.sequence_no,
            page_range: article
                .page_range
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string),
            question_range: article
                .question_range
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string),
            question_area,
            paragraphs,
            topic,
        });
    }

    let existing: Option<(String, String)> = conn
        .query_row(
            "SELECT id, title FROM suites WHERE fingerprint = ?1",
            params![fingerprint],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some((suite_id, suite_title)) = existing {
        let articles = list_suite_articles(conn, &suite_id)?;
        return Ok(ImportSuiteResult {
            suite_id,
            title: suite_title,
            created: false,
            articles,
        });
    }

    let exam_level = input
        .exam_level
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let suite_id = Uuid::new_v4().to_string();
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO suites (id, title, source, exam_level, fingerprint)
         VALUES (?1, ?2, 'pdf', ?3, ?4)",
        params![suite_id, title, exam_level, fingerprint],
    )
    .map_err(|e| format!("保存套卷失败：{e}"))?;

    let default_section: Option<String> = tx
        .query_row(
            "SELECT id FROM reading_sections ORDER BY sort_order, created_at LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let mut position: i64 = if let Some(section_id) = &default_section {
        tx.query_row(
            "SELECT COALESCE(MAX(position), 0) FROM section_articles WHERE section_id = ?1",
            params![section_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?
    } else {
        0
    };

    for article in prepared {
        let raw = serde_json::to_string(&article.paragraphs).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO articles
                (suite_id, title, paragraphs, topic, exam_type, sequence_no,
                 page_range, question_range, question_area)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                suite_id,
                article.title,
                raw,
                article.topic,
                article.exam_type,
                article.sequence_no,
                article.page_range,
                article.question_range,
                article.question_area
            ],
        )
        .map_err(|e| {
            let message = e.to_string();
            if message.contains("UNIQUE") {
                format!(
                    "题号重复：第 {} 篇在一套卷内出现了两次",
                    article.sequence_no
                )
            } else {
                format!("保存《{}》失败：{message}", article.title)
            }
        })?;
        let article_id = tx.last_insert_rowid();
        if let Some(section_id) = &default_section {
            position += 1;
            tx.execute(
                "INSERT INTO section_articles (section_id, article_id, position)
                 VALUES (?1, ?2, ?3)",
                params![section_id, article_id, position],
            )
            .map_err(|e| format!("加入默认分区失败：{e}"))?;
        }
    }
    tx.commit().map_err(|e| format!("提交套卷失败：{e}"))?;

    let articles = list_suite_articles(conn, &suite_id)?;
    Ok(ImportSuiteResult {
        suite_id,
        title: title.to_string(),
        created: true,
        articles,
    })
}

pub fn update_article(
    conn: &mut Connection,
    input: &UpdateArticleInput,
) -> Result<ArticleDetail, String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("标题不能为空".into());
    }
    let paragraphs: Vec<String> = input
        .paragraphs
        .iter()
        .map(|p| p.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|p| !p.is_empty())
        .collect();
    if paragraphs.is_empty() {
        return Err("正文不能为空".into());
    }
    let topic = match input.topic.trim() {
        "" => "未分类",
        t => t,
    };
    let current: Option<i64> = conn
        .query_row(
            "SELECT version FROM articles WHERE id = ?1",
            params![input.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(current) = current else {
        return Err("找不到这篇文章".into());
    };
    if current != input.expected_version {
        return Err("正文已在其他位置更新，请先保留当前草稿再重新加载".into());
    }
    let raw = serde_json::to_string(&paragraphs).map_err(|e| e.to_string())?;
    let changed = conn
        .execute(
            "UPDATE articles
             SET title = ?1, topic = ?2, paragraphs = ?3,
                 version = version + 1,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?4 AND version = ?5",
            params![title, topic, raw, input.id, input.expected_version],
        )
        .map_err(|e| format!("保存正文失败：{e}"))?;
    if changed == 0 {
        return Err("正文已在其他位置更新，请先保留当前草稿再重新加载".into());
    }
    get_article(conn, input.id)
}

pub fn add_articles_to_section(
    conn: &mut Connection,
    section_id: &str,
    article_ids: &[i64],
) -> Result<AddResult, String> {
    if !section_exists(conn, section_id)? {
        return Err("找不到这个分区".into());
    }
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let mut position: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(position), 0) FROM section_articles WHERE section_id = ?1",
            params![section_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let mut added = 0;
    let mut seen = HashSet::new();
    for article_id in article_ids {
        if !seen.insert(*article_id) {
            continue;
        }
        let exists: Option<i64> = tx
            .query_row(
                "SELECT id FROM articles WHERE id = ?1",
                params![article_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if exists.is_none() {
            return Err(format!("找不到文章 {article_id}"));
        }
        let already: Option<i64> = tx
            .query_row(
                "SELECT 1 FROM section_articles WHERE section_id = ?1 AND article_id = ?2",
                params![section_id, article_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if already.is_some() {
            continue;
        }
        position += 1;
        tx.execute(
            "INSERT INTO section_articles (section_id, article_id, position) VALUES (?1, ?2, ?3)",
            params![section_id, article_id, position],
        )
        .map_err(|e| format!("加入分区失败：{e}"))?;
        added += 1;
    }
    tx.commit().map_err(|e| format!("提交分区变更失败：{e}"))?;
    Ok(AddResult { added })
}

pub fn remove_article_from_section(
    conn: &mut Connection,
    section_id: &str,
    article_id: i64,
) -> Result<bool, String> {
    if !section_exists(conn, section_id)? {
        return Err("找不到这个分区".into());
    }
    let changed = conn
        .execute(
            "DELETE FROM section_articles WHERE section_id = ?1 AND article_id = ?2",
            params![section_id, article_id],
        )
        .map_err(|e| e.to_string())?;
    Ok(changed > 0)
}

// ---------------------------------------------------------------------------
// 文本处理
// ---------------------------------------------------------------------------

/// 有空行时按空行分段；否则每个非空行一段。段内硬换行合并为空格。
pub fn parse_pasted_text(text: &str) -> Vec<String> {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let lines: Vec<&str> = normalized.lines().collect();
    let has_blank_separator = lines.iter().enumerate().any(|(index, line)| {
        line.trim().is_empty()
            && lines[..index].iter().any(|l| !l.trim().is_empty())
            && lines[index + 1..].iter().any(|l| !l.trim().is_empty())
    });

    let mut blocks: Vec<Vec<&str>> = Vec::new();
    let mut current: Vec<&str> = Vec::new();
    for line in lines {
        if line.trim().is_empty() {
            if !current.is_empty() {
                blocks.push(std::mem::take(&mut current));
            }
            continue;
        }
        if has_blank_separator {
            current.push(line);
        } else {
            blocks.push(vec![line]);
        }
    }
    if !current.is_empty() {
        blocks.push(current);
    }
    blocks
        .into_iter()
        .map(|block| block.join(" ").split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|p| !p.is_empty())
        .collect()
}

const TOPIC_KEYWORDS: &[(&str, &[&str])] = &[
    (
        "城市与生活",
        &[
            "city", "cities", "street", "streets", "urban", "neighborhood", "walk",
            "walking", "transport", "traffic", "park", "housing", "public", "space",
        ],
    ),
    (
        "教育与学习",
        &[
            "student", "students", "teacher", "teachers", "learn", "learning", "school",
            "classroom", "education", "university", "course", "study", "teach", "teaching",
            "lesson", "exam",
        ],
    ),
    (
        "科技与创新",
        &[
            "technology", "digital", "internet", "computer", "software", "artificial",
            "intelligence", "ai", "robot", "robots", "data", "online", "innovation",
            "algorithm", "device", "machine",
        ],
    ),
    (
        "健康与环境",
        &[
            "health", "climate", "environment", "pollution", "exercise", "medical",
            "disease", "energy", "nature", "green", "waste", "sustainable", "food",
            "sleep", "body",
        ],
    ),
    (
        "工作与经济",
        &[
            "work", "job", "jobs", "career", "economy", "economic", "business", "market",
            "employee", "employer", "income", "company", "industry", "office", "money",
            "trade", "price",
        ],
    ),
    (
        "科学与自然",
        &[
            "science", "scientist", "scientists", "research", "species", "space",
            "physics", "biology", "experiment", "planet", "animal", "animals", "brain",
            "universe", "earth",
        ],
    ),
    (
        "社会与文化",
        &[
            "society", "culture", "cultural", "history", "art", "arts", "community",
            "tradition", "language", "media", "family", "people", "social", "music",
            "book", "books",
        ],
    ),
];

pub fn classify_topic(text: &str) -> String {
    let lowered = text.to_lowercase();
    let tokens: Vec<&str> = lowered
        .split(|c: char| !c.is_ascii_alphabetic())
        .filter(|s| !s.is_empty())
        .collect();
    let mut best = "未分类";
    let mut best_score = 0usize;
    for (topic, keywords) in TOPIC_KEYWORDS {
        let score = tokens
            .iter()
            .filter(|token| keywords.contains(token))
            .count();
        if score > best_score {
            best = topic;
            best_score = score;
        }
    }
    best.to_string()
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&mut conn, MIGRATIONS).unwrap();
        conn
    }

    fn insert_article(conn: &Connection, title: &str, paragraphs: &[&str]) -> i64 {
        let raw = serde_json::to_string(paragraphs).unwrap();
        conn.execute(
            "INSERT INTO articles (title, paragraphs) VALUES (?1, ?2)",
            params![title, raw],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    #[test]
    fn fresh_database_has_default_section() {
        let conn = memory_db();
        let sections = list_sections(&conn).unwrap();
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].name, "我的阅读");
        assert_eq!(sections[0].article_count, 0);
    }

    #[test]
    fn upgrading_old_database_keeps_articles_visible() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&mut conn, &MIGRATIONS[..1]).unwrap();
        let id = insert_article(&conn, "旧文章", &["Old body."]);
        run_migrations(&mut conn, MIGRATIONS).unwrap();
        let sections = list_sections(&conn).unwrap();
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].name, "我的阅读");
        assert_eq!(sections[0].article_count, 1);
        let articles = list_section_articles(&conn, &sections[0].id).unwrap();
        assert_eq!(articles[0].id, id);
        assert_eq!(articles[0].title, "旧文章");
        // 再次运行不会重新加回已移除的文章
        remove_article_from_section(&mut conn, &sections[0].id, id).unwrap();
        run_migrations(&mut conn, MIGRATIONS).unwrap();
        assert!(list_section_articles(&conn, &sections[0].id).unwrap().is_empty());
    }

    #[test]
    fn paste_splits_paragraphs_and_joins_default_section() {
        let mut conn = memory_db();
        let text = "First paragraph line one.\r\nline two.\r\n\r\nSecond paragraph.\r\n\r\nThird paragraph.";
        let detail = paste_article(&mut conn, "  Test Article  ", text, None).unwrap();
        assert_eq!(detail.summary.title, "Test Article");
        assert_eq!(detail.paragraphs.len(), 3);
        assert_eq!(detail.paragraphs[1], "Second paragraph.");
        assert_eq!(detail.section_ids.len(), 1);
        assert_eq!(detail.source, "paste");
        assert_eq!(detail.summary.paragraph_count, 3);
    }

    #[test]
    fn empty_paste_is_rejected() {
        let mut conn = memory_db();
        assert!(paste_article(&mut conn, "Title", "   \n\n  ", None).is_err());
        assert!(paste_article(&mut conn, "   ", "Some text", None).is_err());
    }

    #[test]
    fn manual_topic_is_persisted_and_empty_topic_is_classified() {
        let mut conn = memory_db();
        let manual = paste_article(
            &mut conn,
            "Manual Topic",
            "Students learn in a quiet classroom.",
            Some(" 健康与环境 "),
        )
        .unwrap();
        assert_eq!(manual.summary.topic, "健康与环境");
        let reloaded = get_article(&conn, manual.summary.id).unwrap();
        assert_eq!(reloaded.summary.topic, "健康与环境");
        let blank = paste_article(
            &mut conn,
            "Blank Topic",
            "Students learn in a quiet classroom.",
            Some("   "),
        )
        .unwrap();
        assert_eq!(blank.summary.topic, "教育与学习");
        let missing = paste_article(
            &mut conn,
            "Missing Topic",
            "Students learn in a quiet classroom.",
            None,
        )
        .unwrap();
        assert_eq!(missing.summary.topic, "教育与学习");
    }

    #[test]
    fn edit_bumps_version_and_persists_paragraphs() {
        let mut conn = memory_db();
        let created = paste_article(&mut conn, "Title", "One.\n\nTwo.\n\nThree.", None).unwrap();
        let updated = update_article(
            &mut conn,
            &UpdateArticleInput {
                id: created.summary.id,
                title: "Renamed".into(),
                topic: "教育与学习".into(),
                paragraphs: vec!["One.".into(), "Two changed.".into(), "Three.".into()],
                expected_version: 1,
            },
        )
        .unwrap();
        assert_eq!(updated.summary.version, 2);
        assert_eq!(updated.paragraphs[1], "Two changed.");
        let reloaded = get_article(&conn, created.summary.id).unwrap();
        assert_eq!(reloaded.summary.title, "Renamed");
        assert_eq!(reloaded.paragraphs[1], "Two changed.");
        // 旧版本号提交会被拒绝
        assert!(update_article(
            &mut conn,
            &UpdateArticleInput {
                id: created.summary.id,
                title: "Stale".into(),
                topic: "未分类".into(),
                paragraphs: vec!["Stale.".into()],
                expected_version: 1,
            },
        )
        .is_err());
    }

    #[test]
    fn article_can_belong_to_two_sections_and_removal_keeps_source() {
        let mut conn = memory_db();
        let detail = paste_article(&mut conn, "Title", "Body.", None).unwrap();
        let default_id = detail.section_ids[0].clone();
        let second = create_section(&mut conn, "本周精读").unwrap();
        let result = add_articles_to_section(&mut conn, &second.id, &[detail.summary.id, detail.summary.id]).unwrap();
        assert_eq!(result.added, 1);
        // 重复添加不再产生成员
        let again = add_articles_to_section(&mut conn, &second.id, &[detail.summary.id]).unwrap();
        assert_eq!(again.added, 0);
        let memberships = get_article_sections(&conn, detail.summary.id).unwrap();
        assert_eq!(memberships.len(), 2);
        assert!(remove_article_from_section(&mut conn, &second.id, detail.summary.id).unwrap());
        assert_eq!(list_section_articles(&conn, &second.id).unwrap().len(), 0);
        assert_eq!(list_section_articles(&conn, &default_id).unwrap().len(), 1);
        assert!(get_article(&conn, detail.summary.id).is_ok());
    }

    #[test]
    fn section_name_is_trimmed_and_required() {
        let mut conn = memory_db();
        assert!(create_section(&mut conn, "   ").is_err());
        let section = create_section(&mut conn, "  本周精读  ").unwrap();
        assert_eq!(section.name, "本周精读");
        assert!(rename_section(&mut conn, &section.id, "  ").is_err());
        let renamed = rename_section(&mut conn, &section.id, " 下周再读 ").unwrap();
        assert_eq!(renamed.name, "下周再读");
    }

    #[test]
    fn library_search_groups_pasted_articles() {
        let mut conn = memory_db();
        paste_article(&mut conn, "City Walking", "A city street.", None).unwrap();
        paste_article(&mut conn, "Learning Silence", "A quiet classroom.", None).unwrap();
        let all = list_library(&conn, None).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].title, "单篇材料");
        assert_eq!(all[0].articles.len(), 2);
        let filtered = list_library(&conn, Some("city")).unwrap();
        assert_eq!(filtered[0].articles.len(), 1);
        assert_eq!(filtered[0].articles[0].title, "City Walking");
    }

    #[test]
    fn topic_classifier_uses_local_keywords() {
        assert_eq!(
            classify_topic("Students learn in a quiet classroom."),
            "教育与学习"
        );
        assert_eq!(classify_topic("Something entirely neutral."), "未分类");
    }

    #[test]
    fn single_line_paste_creates_one_paragraph_per_line() {
        let paragraphs = parse_pasted_text("One line.\nTwo line.\nThree line.");
        assert_eq!(paragraphs.len(), 3);
    }

    fn import_input(sequence_numbers: &[i64]) -> ImportSuiteInput {
        ImportSuiteInput {
            title: "2026年6月大学英语四级真题（第1套）".into(),
            fingerprint: "fingerprint-001".into(),
            exam_level: Some("四级".into()),
            articles: sequence_numbers
                .iter()
                .map(|sequence_no| ImportArticleInput {
                    title: format!("阅读文章 {sequence_no}"),
                    exam_type: "仔细阅读".into(),
                    sequence_no: *sequence_no,
                    page_range: Some(format!("{sequence_no}–{}", sequence_no + 1)),
                    question_range: Some(format!("{}–{}", 45 + sequence_no, 49 + sequence_no)),
                    question_area: Some(r#"{"kind":"multiple_choice","questions":[]}"#.into()),
                    paragraphs: vec!["A short reading passage for the import test.".into()],
                })
                .collect(),
        }
    }

    fn row_count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn import_suite_creates_cards_with_metadata_and_default_membership() {
        let mut conn = memory_db();
        let result = import_suite(&mut conn, &import_input(&[1, 2, 3, 4])).unwrap();
        assert!(result.created);
        assert_eq!(result.title, "2026年6月大学英语四级真题（第1套）");
        assert_eq!(result.articles.len(), 4);
        assert_eq!(
            result
                .articles
                .iter()
                .map(|article| article.sequence_no.unwrap())
                .collect::<Vec<_>>(),
            vec![1, 2, 3, 4]
        );
        let first = &result.articles[0];
        assert_eq!(first.suite_id.as_deref(), Some(result.suite_id.as_str()));
        assert_eq!(first.page_range.as_deref(), Some("1–2"));
        assert_eq!(first.question_range.as_deref(), Some("46–50"));

        let detail = get_article(&conn, first.id).unwrap();
        assert_eq!(detail.source, "suite");
        assert_eq!(
            detail.question_area.as_deref(),
            Some(r#"{"kind":"multiple_choice","questions":[]}"#)
        );
        assert_eq!(detail.section_ids.len(), 1);

        let groups = list_library(&conn, None).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].source, "pdf");
        assert_eq!(groups[0].articles.len(), 4);
        assert_eq!(groups[0].articles[0].title, "阅读文章 1");
        let sections = list_sections(&conn).unwrap();
        assert_eq!(sections[0].article_count, 4);
    }

    #[test]
    fn importing_the_same_fingerprint_does_not_create_a_second_suite() {
        let mut conn = memory_db();
        let first = import_suite(&mut conn, &import_input(&[1, 2, 3, 4])).unwrap();
        let second = import_suite(&mut conn, &import_input(&[1, 2, 3, 4])).unwrap();
        assert!(!second.created);
        assert_eq!(second.suite_id, first.suite_id);
        assert_eq!(
            second.articles.iter().map(|article| article.id).collect::<Vec<_>>(),
            first.articles.iter().map(|article| article.id).collect::<Vec<_>>()
        );
        assert_eq!(row_count(&conn, "suites"), 1);
        assert_eq!(row_count(&conn, "articles"), 4);
        assert_eq!(row_count(&conn, "section_articles"), 4);
    }

    #[test]
    fn duplicate_sequence_rolls_back_the_whole_suite() {
        let mut conn = memory_db();
        let error = import_suite(&mut conn, &import_input(&[1, 1])).unwrap_err();
        assert!(error.contains("题号重复"));
        assert_eq!(row_count(&conn, "suites"), 0);
        assert_eq!(row_count(&conn, "articles"), 0);
        assert_eq!(row_count(&conn, "section_articles"), 0);
    }

    #[test]
    fn invalid_import_is_rejected_before_any_write() {
        let mut conn = memory_db();
        let mut input = import_input(&[1]);
        input.articles[0].paragraphs = vec!["   ".into()];
        let error = import_suite(&mut conn, &input).unwrap_err();
        assert!(error.contains("正文为空"));
        assert_eq!(row_count(&conn, "suites"), 0);
        assert_eq!(row_count(&conn, "articles"), 0);
    }
}