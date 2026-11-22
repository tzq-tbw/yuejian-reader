use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EssayRevision {
    pub id: i64,
    pub document_id: i64,
    pub revision_no: i64,
    pub text: String,
    pub result: serde_json::Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EssayDocumentSummary {
    pub id: i64,
    pub sequence_no: i64,
    pub name: String,
    pub text: String,
    pub revision_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EssayDocument {
    pub id: i64,
    pub sequence_no: i64,
    pub name: String,
    pub text: String,
    pub revision_count: i64,
    pub revisions: Vec<EssayRevision>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEssayDocumentInput {
    pub name: Option<String>,
    pub text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddEssayRevisionInput {
    pub document_id: i64,
    pub text: String,
    pub result: serde_json::Value,
}

fn validate_text(text: &str) -> Result<String, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("作文正文不能为空".to_string());
    }
    if text.chars().count() > 30_000 {
        return Err("作文过长，请控制在 30000 个字符以内".to_string());
    }
    Ok(text.to_string())
}

fn validate_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("修改区名称不能为空".to_string());
    }
    if name.chars().count() > 60 {
        return Err("修改区名称不能超过 60 个字符".to_string());
    }
    Ok(name.to_string())
}

pub fn get_essay_document(conn: &Connection, id: i64) -> Result<EssayDocument, String> {
    let (id, sequence_no, name, text, created_at, updated_at) = conn
        .query_row(
            "SELECT id, sequence_no, name, text, created_at, updated_at
             FROM essay_documents WHERE id = ?1",
            params![id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .optional()
        .map_err(|error| format!("读取作文失败：{error}"))?
        .ok_or_else(|| "找不到这篇作文".to_string())?;
    let mut statement = conn
        .prepare(
            "SELECT id, document_id, revision_no, text, result_json, created_at
             FROM essay_revisions WHERE document_id = ?1 ORDER BY revision_no",
        )
        .map_err(|error| format!("读取批改历史失败：{error}"))?;
    let rows = statement
        .query_map(params![id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|error| format!("读取批改历史失败：{error}"))?;
    let mut revisions = Vec::new();
    for row in rows {
        let (id, document_id, revision_no, text, result_json, created_at) =
            row.map_err(|error| format!("读取批改历史失败：{error}"))?;
        let result = serde_json::from_str(&result_json)
            .map_err(|_| "批改历史内容损坏，无法读取".to_string())?;
        revisions.push(EssayRevision {
            id,
            document_id,
            revision_no,
            text,
            result,
            created_at,
        });
    }
    Ok(EssayDocument {
        id,
        sequence_no,
        name,
        text,
        revisions,
        created_at,
        updated_at,
    })
}

pub fn list_essay_documents(conn: &Connection) -> Result<Vec<EssayDocument>, String> {
    let mut statement = conn
        .prepare("SELECT id FROM essay_documents ORDER BY sequence_no")
        .map_err(|error| format!("读取作文列表失败：{error}"))?;
    let ids = statement
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(|error| format!("读取作文列表失败：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("读取作文列表失败：{error}"))?;
    ids.into_iter().map(|id| get_essay_document(conn, id)).collect()
}

pub fn create_essay_document(
    conn: &mut Connection,
    input: CreateEssayDocumentInput,
) -> Result<EssayDocument, String> {
    let text = validate_text(&input.text)?;
    let name = match input.name.as_deref().map(str::trim).filter(|name| !name.is_empty()) {
        Some(name) => validate_name(name)?,
        None => "未命名作文".to_string(),
    };
    let tx = conn
        .transaction()
        .map_err(|error| format!("开始保存作文失败：{error}"))?;
    let sequence_no = tx
        .query_row(
            "SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM essay_documents",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| format!("生成作文序号失败：{error}"))?;
    tx.execute(
        "INSERT INTO essay_documents (sequence_no, name, text) VALUES (?1, ?2, ?3)",
        params![sequence_no, name, text],
    )
    .map_err(|error| format!("保存作文失败：{error}"))?;
    let id = tx.last_insert_rowid();
    tx.commit()
        .map_err(|error| format!("提交作文失败：{error}"))?;
    get_essay_document(conn, id)
}

pub fn rename_essay_document(
    conn: &Connection,
    id: i64,
    name: String,
) -> Result<EssayDocument, String> {
    let name = validate_name(&name)?;
    let changed = conn
        .execute(
            "UPDATE essay_documents SET name = ?1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2",
            params![name, id],
        )
        .map_err(|error| format!("重命名作文失败：{error}"))?;
    if changed == 0 {
        return Err("找不到这篇作文".to_string());
    }
    get_essay_document(conn, id)
}

pub fn update_essay_text(conn: &Connection, id: i64, text: String) -> Result<EssayDocument, String> {
    let text = validate_text(&text)?;
    let changed = conn
        .execute(
            "UPDATE essay_documents SET text = ?1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2",
            params![text, id],
        )
        .map_err(|error| format!("保存作文正文失败：{error}"))?;
    if changed == 0 {
        return Err("找不到这篇作文".to_string());
    }
    get_essay_document(conn, id)
}

pub fn delete_essay_document(conn: &Connection, id: i64) -> Result<bool, String> {
    let changed = conn
        .execute("DELETE FROM essay_documents WHERE id = ?1", params![id])
        .map_err(|error| format!("删除作文失败：{error}"))?;
    Ok(changed > 0)
}

pub fn add_essay_revision(
    conn: &mut Connection,
    input: AddEssayRevisionInput,
) -> Result<EssayRevision, String> {
    let text = validate_text(&input.text)?;
    let result_json = serde_json::to_string(&input.result)
        .map_err(|error| format!("保存批改结果失败：{error}"))?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("开始保存批改失败：{error}"))?;
    let exists = tx
        .query_row(
            "SELECT 1 FROM essay_documents WHERE id = ?1",
            params![input.document_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|error| format!("读取作文失败：{error}"))?;
    if exists.is_none() {
        return Err("找不到这篇作文".to_string());
    }
    let revision_no = tx
        .query_row(
            "SELECT COALESCE(MAX(revision_no), 0) + 1 FROM essay_revisions WHERE document_id = ?1",
            params![input.document_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| format!("生成批改序号失败：{error}"))?;
    tx.execute(
        "INSERT INTO essay_revisions (document_id, revision_no, text, result_json)
         VALUES (?1, ?2, ?3, ?4)",
        params![input.document_id, revision_no, text, result_json],
    )
    .map_err(|error| format!("保存批改结果失败：{error}"))?;
    tx.execute(
        "UPDATE essay_documents SET text = ?1,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2",
        params![text, input.document_id],
    )
    .map_err(|error| format!("保存作文正文失败：{error}"))?;
    let id = tx.last_insert_rowid();
    tx.commit()
        .map_err(|error| format!("提交批改结果失败：{error}"))?;
    Ok(get_essay_document(conn, input.document_id)?
        .revisions
        .into_iter()
        .find(|revision| revision.id == id)
        .ok_or_else(|| "读取新批改记录失败".to_string())?)
}

pub fn delete_essay_revision(conn: &Connection, id: i64) -> Result<bool, String> {
    let changed = conn
        .execute("DELETE FROM essay_revisions WHERE id = ?1", params![id])
        .map_err(|error| format!("删除批改记录失败：{error}"))?;
    Ok(changed > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{run_migrations, MIGRATIONS};
    use serde_json::json;

    fn memory_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&mut conn, MIGRATIONS).unwrap();
        conn
    }

    fn input(text: &str) -> CreateEssayDocumentInput {
        CreateEssayDocumentInput {
            name: Some("26四级作文".to_string()),
            text: text.to_string(),
        }
    }

    #[test]
    fn document_crud_and_revision_history_share_one_sequence() {
        let mut conn = memory_db();
        let document = create_essay_document(&mut conn, input("He go to school.")).unwrap();
        assert_eq!(document.sequence_no, 1);
        assert_eq!(document.name, "26四级作文");
        let second = create_essay_document(&mut conn, input("Another essay.")).unwrap();
        assert_eq!(second.sequence_no, 2);

        for (text, polished) in [
            ("He go to school.", "He goes to school."),
            ("He goes to school every day.", "He goes to school daily."),
        ] {
            add_essay_revision(
                &mut conn,
                AddEssayRevisionInput {
                    document_id: document.id,
                    text: text.to_string(),
                    result: json!({ "issues": [], "polished": polished }),
                },
            )
            .unwrap();
        }
        let renamed = rename_essay_document(&conn, document.id, "四级第一篇".to_string()).unwrap();
        assert_eq!(renamed.name, "四级第一篇");
        assert_eq!(renamed.revisions.len(), 2);
        assert_eq!(renamed.revisions[0].revision_no, 1);
        assert_eq!(renamed.revisions[1].text, "He goes to school every day.");
        assert_eq!(renamed.text, "He goes to school every day.");

        assert!(delete_essay_revision(&conn, renamed.revisions[0].id).unwrap());
        assert_eq!(get_essay_document(&conn, document.id).unwrap().revisions.len(), 1);
        assert!(delete_essay_document(&conn, document.id).unwrap());
        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM essay_revisions WHERE document_id = ?1", params![document.id], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining, 0);
        assert!(!delete_essay_document(&conn, document.id).unwrap());
    }

    #[test]
    fn invalid_revision_does_not_replace_current_text() {
        let mut conn = memory_db();
        let document = create_essay_document(&mut conn, input("Original essay.")).unwrap();
        assert!(add_essay_revision(
            &mut conn,
            AddEssayRevisionInput {
                document_id: document.id,
                text: "  ".to_string(),
                result: json!({ "issues": [], "polished": "" }),
            },
        )
        .is_err());
        assert_eq!(get_essay_document(&conn, document.id).unwrap().text, "Original essay.");
        assert!(get_essay_document(&conn, document.id).unwrap().revisions.is_empty());
    }
}
