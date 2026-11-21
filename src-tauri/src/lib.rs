mod db;

use db::{
    AddResult, ArticleDetail, ArticleSummary, LibraryGroup, PasteArticleInput, Section,
    UpdateArticleInput,
};
use std::sync::Mutex;
use tauri::{Manager, State};

pub struct DbState(pub Mutex<rusqlite::Connection>);

impl DbState {
    pub fn new(conn: rusqlite::Connection) -> Self {
        Self(Mutex::new(conn))
    }
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            update_article,
            add_articles_to_section,
            remove_article_from_section,
            get_article_sections,
        ])
        .run(tauri::generate_context!())
        .expect("error while running 阅间");
}