use std::time::Duration;
use tauri::async_runtime::Mutex;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

static CHECKING: Mutex<()> = Mutex::const_new(());

#[tauri::command]
pub async fn check_app_update(app: AppHandle) -> Result<String, String> {
    let _guard = CHECKING.try_lock().map_err(|_| "更新检查仍在进行中")?;
    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|err| format!("无法初始化更新：{err}"))?;
    let Some(mut update) = updater.check().await.map_err(|err| format!("无法检查更新：{err}"))? else {
        return Ok(format!("当前版本 {} 已是最新", app.package_info().version));
    };
    // A large installer can take longer to download than the release manifest.
    update.timeout = Some(Duration::from_secs(300));
    update.download_and_install(|_, _| {}, || {}).await
        .map_err(|err| format!("下载、校验或安装更新失败：{err}"))?;
    Ok(format!("已启动 {} 的安装程序", update.version))
}
