use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordlistSummary {
    pub id: String,
    pub name: String,
    pub source: String,
    pub enabled: bool,
    pub built_in: bool,
    pub word_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordlistWords {
    pub id: String,
    pub name: String,
    pub words: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportWordlistInput {
    pub name: String,
    pub source: String,
    pub content: String,
}

fn first_csv_field(line: &str) -> String {
    let trimmed = line.trim();
    if let Some(quoted) = trimmed.strip_prefix('"') {
        let mut field = String::new();
        let mut chars = quoted.chars().peekable();
        while let Some(character) = chars.next() {
            if character == '"' {
                if chars.peek() == Some(&'"') {
                    chars.next();
                    field.push('"');
                    continue;
                }
                break;
            }
            field.push(character);
        }
        return field;
    }
    let field = trimmed.split(',').next().unwrap_or("").trim_matches('"');
    if trimmed.contains(',') {
        field.to_string()
    } else {
        field.split_whitespace().next().unwrap_or("").to_string()
    }
}

pub fn parse_wordlist(content: &str) -> Result<Vec<String>, String> {
    let mut seen = HashSet::new();
    let mut words = Vec::new();
    for (index, line) in content.trim_start_matches('\u{FEFF}').lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') {
            continue;
        }
        let candidate = first_csv_field(trimmed).trim().to_ascii_lowercase();
        if index == 0 && matches!(candidate.as_str(), "word" | "words" | "vocabulary") {
            continue;
        }
        let valid = !candidate.is_empty()
            && candidate.len() <= 64
            && candidate.chars().all(|character| {
                character.is_ascii_alphabetic() || character == '-' || character == '\''
            })
            && candidate
                .chars()
                .any(|character| character.is_ascii_alphabetic());
        if valid && seen.insert(candidate.clone()) {
            words.push(candidate);
        }
    }
    if words.is_empty() {
        return Err("文件中没有可导入的英文单词；请使用一行一词或首列为单词的 CSV".to_string());
    }
    if words.len() > 100_000 {
        return Err("单个词表最多导入 100000 个单词".to_string());
    }
    Ok(words)
}

pub fn list_wordlists(conn: &Connection) -> Result<Vec<WordlistSummary>, String> {
    let mut statement = conn
        .prepare(
            "SELECT w.id, w.name, w.source, w.enabled, w.built_in, COUNT(v.word) AS word_count
             FROM wordlists w LEFT JOIN wordlist_words v ON v.list_id = w.id
             GROUP BY w.id
             ORDER BY w.built_in DESC,
                      CASE w.id WHEN 'cet4' THEN 1 WHEN 'cet6' THEN 2 WHEN 'ky' THEN 3 ELSE 4 END,
                      w.created_at, w.id",
        )
        .map_err(|error| format!("读取词表失败：{error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(WordlistSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                source: row.get(2)?,
                enabled: row.get::<_, i64>(3)? == 1,
                built_in: row.get::<_, i64>(4)? == 1,
                word_count: row.get(5)?,
            })
        })
        .map_err(|error| format!("读取词表失败：{error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("读取词表失败：{error}"))
}

pub fn list_words(
    conn: &Connection,
    list_ids: Option<Vec<String>>,
) -> Result<Vec<WordlistWords>, String> {
    if list_ids.as_ref().is_some_and(|ids| ids.is_empty()) {
        return Ok(Vec::new());
    }
    let selected = list_ids.map(|ids| ids.into_iter().collect::<HashSet<_>>());
    let lists = list_wordlists(conn)?
        .into_iter()
        .filter(|list| list.enabled)
        .filter(|list| selected.as_ref().map_or(true, |ids| ids.contains(&list.id)))
        .collect::<Vec<_>>();
    let mut result = Vec::new();
    for list in lists {
        let mut statement = conn
            .prepare("SELECT word FROM wordlist_words WHERE list_id = ?1 ORDER BY position, word")
            .map_err(|error| format!("读取词表单词失败：{error}"))?;
        let words = statement
            .query_map(params![list.id], |row| row.get::<_, String>(0))
            .map_err(|error| format!("读取词表单词失败：{error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("读取词表单词失败：{error}"))?;
        result.push(WordlistWords {
            id: list.id,
            name: list.name,
            words,
        });
    }
    Ok(result)
}

pub fn import_wordlist(
    conn: &mut Connection,
    input: ImportWordlistInput,
) -> Result<WordlistSummary, String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("词表名称不能为空".to_string());
    }
    if name.chars().count() > 60 {
        return Err("词表名称不能超过 60 个字符".to_string());
    }
    let words = parse_wordlist(&input.content)?;
    let source = input.source.trim();
    let id = format!("custom-{}", Uuid::new_v4());
    let tx = conn
        .transaction()
        .map_err(|error| format!("开始导入词表失败：{error}"))?;
    tx.execute(
        "INSERT INTO wordlists (id, name, source, enabled, built_in) VALUES (?1, ?2, ?3, 1, 0)",
        params![
            id,
            name,
            if source.is_empty() {
                "本地文件"
            } else {
                source
            }
        ],
    )
    .map_err(|error| format!("保存词表失败：{error}"))?;
    for (position, word) in words.iter().enumerate() {
        tx.execute(
            "INSERT INTO wordlist_words (list_id, word, position) VALUES (?1, ?2, ?3)",
            params![id, word, position as i64],
        )
        .map_err(|error| format!("保存词表单词失败：{error}"))?;
    }
    tx.commit()
        .map_err(|error| format!("提交词表失败：{error}"))?;
    Ok(WordlistSummary {
        id,
        name: name.to_string(),
        source: if source.is_empty() {
            "本地文件".to_string()
        } else {
            source.to_string()
        },
        enabled: true,
        built_in: false,
        word_count: words.len() as i64,
    })
}

pub fn delete_wordlist(conn: &Connection, id: &str) -> Result<bool, String> {
    let changed = conn
        .execute("DELETE FROM wordlists WHERE id = ?1", params![id])
        .map_err(|error| format!("删除词表失败：{error}"))?;
    Ok(changed > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{run_migrations, MIGRATIONS};

    fn memory_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&mut conn, MIGRATIONS).unwrap();
        conn
    }

    #[test]
    fn upgrade_removes_only_old_builtin_wordlists() {
        let mut conn = Connection::open_in_memory().unwrap();
        run_migrations(&mut conn, &MIGRATIONS[..6]).unwrap();
        conn.execute_batch(
            "INSERT INTO wordlists (id, name, source, built_in) VALUES
             ('cet4', 'Old test list', 'fixture', 1), ('custom', 'Imported list', 'local.txt', 0);
             INSERT INTO wordlist_words (list_id, word, position) VALUES
             ('cet4', 'test', 0), ('custom', 'address', 0);"
        ).unwrap();
        assert_eq!(run_migrations(&mut conn, MIGRATIONS).unwrap(), 1);
        let lists = list_wordlists(&conn).unwrap();
        assert_eq!(lists.len(), 1);
        assert_eq!(lists[0].id, "custom");
        assert_eq!(list_words(&conn, None).unwrap()[0].words, vec!["address"]);
        let remaining: i64 = conn.query_row(
            "SELECT COUNT(*) FROM wordlist_words WHERE list_id = 'cet4'", [], |row| row.get(0),
        ).unwrap();
        assert_eq!(remaining, 0);
        assert!(list_wordlists(&memory_db()).unwrap().is_empty());
    }

    #[test]
    fn local_txt_and_csv_import_deduplicates_and_deletes() {
        let mut conn = memory_db();
        let imported = import_wordlist(
            &mut conn,
            ImportWordlistInput {
                name: " 高频补充 ".to_string(),
                source: "local.csv".to_string(),
                content: "\u{FEFF}word,definition\r\nApple,苹果\r\n\"banana\",香蕉\r\napple,重复\r\nnot a word,\r\nRun,跑\r\n".to_string(),
            },
        )
        .unwrap();
        assert_eq!(imported.name, "高频补充");
        assert_eq!(imported.word_count, 3);
        assert!(!imported.built_in);
        let words = list_words(&conn, Some(vec![imported.id.clone()])).unwrap();
        assert_eq!(words[0].words, vec!["apple", "banana", "run"]);
        assert!(delete_wordlist(&conn, &imported.id).unwrap());
        assert!(list_words(&conn, Some(vec![imported.id]))
            .unwrap()
            .is_empty());
    }

    #[test]
    fn invalid_import_leaves_no_wordlist() {
        let mut conn = memory_db();
        assert!(import_wordlist(
            &mut conn,
            ImportWordlistInput {
                name: "空表".to_string(),
                source: "empty.txt".to_string(),
                content: "123\n---\n".to_string(),
            },
        )
        .is_err());
        assert!(list_wordlists(&conn).unwrap().is_empty());
    }
}
