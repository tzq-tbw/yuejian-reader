use rusqlite::{params, Connection};
use std::io::Write;
use std::path::Path;

fn first_common_meaning(value: &str) -> &str {
    value
        .split([';', '；', '\r', '\n'])
        .next()
        .unwrap_or("")
        .trim()
}

fn csv_cell(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn write_word_favorites_csv<W: Write>(conn: &Connection, mut writer: W) -> Result<(), String> {
    let mut statement = conn
        .prepare(
            "SELECT word, COALESCE(part_of_speech, ''), common_meaning
             FROM word_favorites ORDER BY created_at DESC, id DESC",
        )
        .map_err(|error| format!("读取生词本失败：{error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| format!("读取生词本失败：{error}"))?;

    writer
        .write_all("\u{FEFF}\"单词\",\"词性\",\"基本意思\"\r\n".as_bytes())
        .map_err(|error| format!("写入 CSV 失败：{error}"))?;
    for row in rows {
        let (word, part_of_speech, common_meaning) =
            row.map_err(|error| format!("读取生词本失败：{error}"))?;
        let line = format!(
            "{},{},{}\r\n",
            csv_cell(&word),
            csv_cell(&part_of_speech),
            csv_cell(first_common_meaning(&common_meaning))
        );
        writer
            .write_all(line.as_bytes())
            .map_err(|error| format!("写入 CSV 失败：{error}"))?;
    }
    Ok(())
}

pub fn export_word_favorites_csv(conn: &Connection) -> Result<String, String> {
    let mut bytes = Vec::new();
    write_word_favorites_csv(conn, &mut bytes)?;
    String::from_utf8(bytes).map_err(|error| format!("CSV 编码失败：{error}"))
}

pub fn backup_database(conn: &Connection, destination: &str) -> Result<String, String> {
    let trimmed = destination.trim();
    if trimmed.is_empty() {
        return Err("备份路径不能为空".to_string());
    }
    let path = Path::new(trimmed);
    if path.exists() {
        return Err("目标文件已存在，请选择一个新文件名".to_string());
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.is_dir() {
            return Err("备份目录不存在".to_string());
        }
    }
    conn.execute("VACUUM INTO ?1", params![trimmed])
        .map_err(|error| format!("备份数据库失败：{error}"))?;
    Ok(trimmed.to_string())
}

pub fn delete_all_data(conn: &mut Connection) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|error| format!("开始清空数据失败：{error}"))?;
    tx.execute_batch(
        "DELETE FROM review_events;
         DELETE FROM review_schedules;
         DELETE FROM word_favorites;
         DELETE FROM long_sentence_favorites;
         DELETE FROM section_articles;
         DELETE FROM reading_sections;
         DELETE FROM articles;
         DELETE FROM suites;
         DELETE FROM wordlist_words;
         DELETE FROM wordlists;
         DELETE FROM sqlite_sequence;",
    )
    .map_err(|error| format!("清空数据失败：{error}"))?;
    tx.commit()
        .map_err(|error| format!("提交清空数据失败：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{run_migrations, MIGRATIONS};
    use uuid::Uuid;

    fn memory_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&mut conn, MIGRATIONS).unwrap();
        conn
    }

    fn temp_path(extension: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("yuejian-r5-{}.{}", Uuid::new_v4(), extension))
    }

    #[test]
    fn export_writes_utf8_csv_file_with_only_basic_word_fields() {
        let conn = memory_db();
        conn.execute(
            "INSERT INTO word_favorites
             (word, normalized_word, sentence, normalized_sentence, article_title,
              paragraph_start, paragraph_end, contextual_meaning, common_meaning, part_of_speech)
             VALUES ('brief, \"summary\"', 'brief', 'A sentence.', 'a sentence.', 'Source',
              0, 0, '不应导出的语境义', '简短, 概要；“摘要”', 'n.')",
            [],
        )
        .unwrap();
        let path = temp_path("csv");
        let file = std::fs::File::create(&path).unwrap();
        write_word_favorites_csv(&conn, file).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        std::fs::remove_file(&path).unwrap();
        assert_eq!(&bytes[..3], b"\xEF\xBB\xBF");
        let csv = String::from_utf8(bytes[3..].to_vec()).unwrap();
        assert_eq!(
            csv,
            "\"单词\",\"词性\",\"基本意思\"\r\n\"brief, \"\"summary\"\"\",\"n.\",\"简短, 概要\"\r\n"
        );
        assert!(!csv.contains("语境义"));
        assert!(!csv.contains("摘要"));
    }

    #[test]
    fn backup_creates_a_readable_sqlite_copy() {
        let conn = memory_db();
        conn.execute(
            "INSERT INTO articles (title, paragraphs) VALUES ('Backup', '[\"Body.\"]')",
            [],
        )
        .unwrap();
        let path = temp_path("db");
        backup_database(&conn, path.to_str().unwrap()).unwrap();
        let backup = Connection::open(&path).unwrap();
        let title: String = backup
            .query_row("SELECT title FROM articles", [], |row| row.get(0))
            .unwrap();
        assert_eq!(title, "Backup");
        drop(backup);
        std::fs::remove_file(&path).unwrap();
        assert!(backup_database(&conn, path.to_str().unwrap()).is_ok());
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn delete_all_data_clears_every_business_table() {
        let mut conn = memory_db();
        conn.execute(
            "INSERT INTO articles (title, paragraphs) VALUES ('Delete', '[\"Body.\"]')",
            [],
        )
        .unwrap();
        delete_all_data(&mut conn).unwrap();
        for table in [
            "review_events",
            "review_schedules",
            "word_favorites",
            "long_sentence_favorites",
            "section_articles",
            "reading_sections",
            "articles",
            "suites",
            "wordlist_words",
            "wordlists",
        ] {
            let count: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(count, 0, "{table} 应为空");
        }
        let migrations: i64 = conn
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(migrations, 5);
    }
}
