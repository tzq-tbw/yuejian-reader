mod db;
mod essay_history;
mod review;
mod settings;
mod wordlists;

use db::{
    AddLongSentenceInput, AddWordFavoriteInput, AddResult, ArticleDetail, ArticleSummary,
    FavoriteAddResult, FillLongSentenceInput, ImportSuiteInput, ImportSuiteResult,
    LibraryGroup, LongSentenceFavorite, PasteArticleInput, ReviewEventInput, ReviewEventResult,
    Section, UpdateArticleInput, WordFavorite,
};
use essay_history::{
    AddEssayRevisionInput, CreateEssayDocumentInput, EssayDocument, EssayRevision,
};
use std::sync::Mutex;
use tauri::{Manager, State};
use wordlists::{ImportWordlistInput, WordlistSummary, WordlistWords};

pub struct DbState(pub Mutex<rusqlite::Connection>);

impl DbState {
    pub fn new(conn: rusqlite::Connection) -> Self {
        Self(Mutex::new(conn))
    }
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelMessage {
    role: String,
    content: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelChatInput {
    base_url: String,
    #[serde(default)]
    api_key: String,
    model: String,
    messages: Vec<ModelMessage>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    timeout_ms: Option<u64>,
}

#[derive(serde::Serialize)]
struct ChatBody<'a> {
    model: &'a str,
    messages: &'a [ModelMessage],
    temperature: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    stream: bool,
}

fn chat_url(base_url: &str) -> Result<String, String> {
    let base = base_url.trim().trim_end_matches('/');
    if !(base.starts_with("http://") || base.starts_with("https://")) {
        return Err("模型服务地址必须以 http:// 或 https:// 开头".to_string());
    }
    Ok(format!("{base}/chat/completions"))
}

/**
 * 模型调用经桌面端发出，避开 WebView 的 CORS 限制。
 * 返回原始 OpenAI 兼容 JSON，由前端统一解析和展示。
 * 密钥只用于本次请求头，不落盘、不写日志。
 */
#[tauri::command]
async fn model_chat(input: ModelChatInput) -> Result<serde_json::Value, String> {
    let url = chat_url(&input.base_url)?;
    let timeout_ms = input.timeout_ms.unwrap_or(90_000).clamp(1_000, 180_000);
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(8))
        .timeout(std::time::Duration::from_millis(timeout_ms))
        .build()
        .map_err(|error| format!("无法初始化模型请求：{error}"))?;

    let mut request = client.post(&url).json(&ChatBody {
        model: &input.model,
        messages: &input.messages,
        temperature: input.temperature.unwrap_or(0.2),
        max_tokens: input.max_tokens,
        stream: false,
    });
    let key = input.api_key.trim();
    if !key.is_empty() {
        request = request.bearer_auth(key);
    }

    let response = request.send().await.map_err(|error| {
        if error.is_timeout() {
            "模型请求超时，请稍后重试".to_string()
        } else if error.is_connect() {
            format!(
                "无法连接模型服务 {}，请检查地址、网络或代理状态",
                input.base_url.trim()
            )
        } else {
            format!("模型请求失败：{error}")
        }
    })?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("读取模型响应失败：{error}"))?;
    if !status.is_success() {
        let excerpt: String = text.trim().chars().take(600).collect();
        return Err(format!("模型服务返回 {}：{excerpt}", status.as_u16()));
    }
    serde_json::from_str::<serde_json::Value>(&text)
        .map_err(|_| "模型服务返回的内容不是有效 JSON".to_string())
}

fn with_conn<T>(
    state: &State<'_, DbState>,
    action: impl FnOnce(&mut rusqlite::Connection) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = state
        .0
        .lock()
        .map_err(|_| "数据库状态异常，请重启应用".to_string())?;
    action(&mut guard)
}

#[tauri::command]
fn list_sections(state: State<'_, DbState>) -> Result<Vec<Section>, String> {
    with_conn(&state, |conn| db::list_sections(conn))
}

#[tauri::command]
fn create_section(state: State<'_, DbState>, name: String) -> Result<Section, String> {
    with_conn(&state, |conn| db::create_section(conn, &name))
}

#[tauri::command]
fn rename_section(state: State<'_, DbState>, id: String, name: String) -> Result<Section, String> {
    with_conn(&state, |conn| db::rename_section(conn, &id, &name))
}

#[tauri::command]
fn list_section_articles(
    state: State<'_, DbState>,
    section_id: String,
) -> Result<Vec<ArticleSummary>, String> {
    with_conn(&state, |conn| db::list_section_articles(conn, &section_id))
}

#[tauri::command]
fn list_library(
    state: State<'_, DbState>,
    search: Option<String>,
) -> Result<Vec<LibraryGroup>, String> {
    with_conn(&state, |conn| db::list_library(conn, search.as_deref()))
}

#[tauri::command]
fn get_article(state: State<'_, DbState>, id: i64) -> Result<ArticleDetail, String> {
    with_conn(&state, |conn| db::get_article(conn, id))
}

#[tauri::command]
fn paste_article(
    state: State<'_, DbState>,
    input: PasteArticleInput,
) -> Result<ArticleDetail, String> {
    with_conn(&state, |conn| {
        db::paste_article(conn, &input.title, &input.text, input.topic.as_deref())
    })
}

#[tauri::command]
fn import_suite(
    state: State<'_, DbState>,
    input: ImportSuiteInput,
) -> Result<ImportSuiteResult, String> {
    with_conn(&state, |conn| db::import_suite(conn, &input))
}

#[tauri::command]
fn update_article(
    state: State<'_, DbState>,
    input: UpdateArticleInput,
) -> Result<ArticleDetail, String> {
    with_conn(&state, |conn| db::update_article(conn, &input))
}

#[tauri::command]
fn add_articles_to_section(
    state: State<'_, DbState>,
    section_id: String,
    article_ids: Vec<i64>,
) -> Result<AddResult, String> {
    with_conn(&state, |conn| {
        db::add_articles_to_section(conn, &section_id, &article_ids)
    })
}

#[tauri::command]
fn remove_article_from_section(
    state: State<'_, DbState>,
    section_id: String,
    article_id: i64,
) -> Result<bool, String> {
    with_conn(&state, |conn| {
        db::remove_article_from_section(conn, &section_id, article_id)
    })
}

#[tauri::command]
fn get_article_sections(
    state: State<'_, DbState>,
    article_id: i64,
) -> Result<Vec<Section>, String> {
    with_conn(&state, |conn| db::get_article_sections(conn, article_id))
}

#[tauri::command]
fn list_word_favorites(
    state: State<'_, DbState>,
    today: String,
) -> Result<Vec<WordFavorite>, String> {
    with_conn(&state, |conn| db::list_word_favorites(conn, &today))
}

#[tauri::command]
fn add_word_favorite(
    state: State<'_, DbState>,
    input: AddWordFavoriteInput,
) -> Result<FavoriteAddResult<WordFavorite>, String> {
    with_conn(&state, |conn| db::add_word_favorite(conn, &input))
}

#[tauri::command]
fn remove_word_favorite(state: State<'_, DbState>, id: i64) -> Result<bool, String> {
    with_conn(&state, |conn| db::remove_word_favorite(conn, id))
}

#[tauri::command]
fn list_long_sentence_favorites(
    state: State<'_, DbState>,
) -> Result<Vec<LongSentenceFavorite>, String> {
    with_conn(&state, |conn| db::list_long_sentence_favorites(conn))
}

#[tauri::command]
fn add_long_sentence_favorite(
    state: State<'_, DbState>,
    input: AddLongSentenceInput,
) -> Result<FavoriteAddResult<LongSentenceFavorite>, String> {
    with_conn(&state, |conn| db::add_long_sentence_favorite(conn, &input))
}

#[tauri::command]
fn fill_long_sentence_favorite(
    state: State<'_, DbState>,
    input: FillLongSentenceInput,
) -> Result<LongSentenceFavorite, String> {
    with_conn(&state, |conn| db::fill_long_sentence_favorite(conn, &input))
}

#[tauri::command]
fn remove_long_sentence_favorite(state: State<'_, DbState>, id: i64) -> Result<bool, String> {
    with_conn(&state, |conn| db::remove_long_sentence_favorite(conn, id))
}

#[tauri::command]
fn list_due_word_favorites(
    state: State<'_, DbState>,
    today: String,
) -> Result<Vec<WordFavorite>, String> {
    with_conn(&state, |conn| db::list_due_word_favorites(conn, &today))
}

#[tauri::command]
fn record_review_event(
    state: State<'_, DbState>,
    input: ReviewEventInput,
) -> Result<ReviewEventResult, String> {
    with_conn(&state, |conn| db::record_review_event(conn, &input))
}

#[tauri::command]
fn export_word_favorites(state: State<'_, DbState>) -> Result<String, String> {
    with_conn(&state, |conn| settings::export_word_favorites_csv(conn))
}

#[tauri::command]
fn backup_database(state: State<'_, DbState>, destination: String) -> Result<String, String> {
    with_conn(&state, |conn| settings::backup_database(conn, &destination))
}

#[tauri::command]
fn delete_all_data(state: State<'_, DbState>) -> Result<(), String> {
    with_conn(&state, |conn| settings::delete_all_data(conn))
}

#[tauri::command]
fn list_wordlists(state: State<'_, DbState>) -> Result<Vec<WordlistSummary>, String> {
    with_conn(&state, |conn| wordlists::list_wordlists(conn))
}

#[tauri::command]
fn list_words(
    state: State<'_, DbState>,
    list_ids: Option<Vec<String>>,
) -> Result<Vec<WordlistWords>, String> {
    with_conn(&state, |conn| wordlists::list_words(conn, list_ids))
}

#[tauri::command]
fn import_wordlist(
    state: State<'_, DbState>,
    input: ImportWordlistInput,
) -> Result<WordlistSummary, String> {
    with_conn(&state, |conn| wordlists::import_wordlist(conn, input))
}

#[tauri::command]
fn delete_wordlist(state: State<'_, DbState>, id: String) -> Result<bool, String> {
    with_conn(&state, |conn| wordlists::delete_wordlist(conn, &id))
}

#[tauri::command]
fn list_essay_documents(state: State<'_, DbState>) -> Result<Vec<EssayDocument>, String> {
    with_conn(&state, |conn| essay_history::list_essay_documents(conn))
}

#[tauri::command]
fn create_essay_document(
    state: State<'_, DbState>,
    input: CreateEssayDocumentInput,
) -> Result<EssayDocument, String> {
    with_conn(&state, |conn| essay_history::create_essay_document(conn, input))
}

#[tauri::command]
fn rename_essay_document(
    state: State<'_, DbState>,
    id: i64,
    name: String,
) -> Result<EssayDocument, String> {
    with_conn(&state, |conn| essay_history::rename_essay_document(conn, id, name))
}

#[tauri::command]
fn update_essay_text(
    state: State<'_, DbState>,
    id: i64,
    text: String,
) -> Result<EssayDocument, String> {
    with_conn(&state, |conn| essay_history::update_essay_text(conn, id, text))
}

#[tauri::command]
fn delete_essay_document(state: State<'_, DbState>, id: i64) -> Result<bool, String> {
    with_conn(&state, |conn| essay_history::delete_essay_document(conn, id))
}

#[tauri::command]
fn add_essay_revision(
    state: State<'_, DbState>,
    input: AddEssayRevisionInput,
) -> Result<EssayRevision, String> {
    with_conn(&state, |conn| essay_history::add_essay_revision(conn, input))
}

#[tauri::command]
fn delete_essay_revision(state: State<'_, DbState>, id: i64) -> Result<bool, String> {
    with_conn(&state, |conn| essay_history::delete_essay_revision(conn, id))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let conn = db::open(&data_dir.join("reader.db"))
                .map_err(std::io::Error::other)?;
            app.manage(DbState::new(conn));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_sections,
            create_section,
            rename_section,
            list_section_articles,
            list_library,
            get_article,
            paste_article,
            import_suite,
            update_article,
            add_articles_to_section,
            remove_article_from_section,
            get_article_sections,
            list_word_favorites,
            add_word_favorite,
            remove_word_favorite,
            list_long_sentence_favorites,
            add_long_sentence_favorite,
            fill_long_sentence_favorite,
            remove_long_sentence_favorite,
            list_due_word_favorites,
            record_review_event,
            export_word_favorites,
            backup_database,
            delete_all_data,
            list_wordlists,
            list_words,
            import_wordlist,
            delete_wordlist,
            list_essay_documents,
            create_essay_document,
            rename_essay_document,
            update_essay_text,
            delete_essay_document,
            add_essay_revision,
            delete_essay_revision,
            model_chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running 阅间");
}

#[cfg(test)]
mod tests {
    use super::{chat_url, model_chat, ModelChatInput, ModelMessage};

    #[test]
    fn chat_url_trims_trailing_slashes() {
        assert_eq!(
            chat_url("http://127.0.0.1:3425/v1/").unwrap(),
            "http://127.0.0.1:3425/v1/chat/completions"
        );
        assert_eq!(
            chat_url(" https://example.com/v1/// ").unwrap(),
            "https://example.com/v1/chat/completions"
        );
    }

    #[test]
    fn chat_url_rejects_non_http_schemes() {
        assert!(chat_url("file:///c:/secret").is_err());
        assert!(chat_url("127.0.0.1:3425/v1").is_err());
        assert!(chat_url("").is_err());
    }

    #[test]
    #[ignore = "需要本机 Magpie 代理，手动运行 cargo test model_chat_round_trip -- --ignored"]
    fn model_chat_round_trip() {
        let input = ModelChatInput {
            base_url: "http://127.0.0.1:3425/v1".to_string(),
            api_key: String::new(),
            model: "auto/deepseek-v4.1-flash".to_string(),
            messages: vec![ModelMessage {
                role: "user".to_string(),
                content: "只回复两个字：收到".to_string(),
            }],
            temperature: Some(0.0),
            max_tokens: Some(20),
            timeout_ms: Some(60_000),
        };
        let value = tauri::async_runtime::block_on(model_chat(input))
            .expect("模型请求应成功");
        let content = value["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("");
        assert!(!content.trim().is_empty(), "模型应返回内容");
    }
}