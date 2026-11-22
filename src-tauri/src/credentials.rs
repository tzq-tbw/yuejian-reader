use std::path::{Path, PathBuf};

fn api_key_path(data_dir: &Path) -> PathBuf {
    data_dir.join("model-api-key")
}

pub fn write_api_key(data_dir: &Path, api_key: &str) -> Result<(), String> {
    let path = api_key_path(data_dir);
    let api_key = api_key.trim();
    if api_key.is_empty() {
        if path.exists() {
            std::fs::remove_file(&path).map_err(|error| format!("清除 API Key 失败：{error}"))?;
        }
        return Ok(());
    }
    std::fs::create_dir_all(data_dir).map_err(|error| format!("创建凭据目录失败：{error}"))?;

    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .mode(0o600)
            .open(&path)
            .map_err(|error| format!("保存 API Key 失败：{error}"))?;
        file.write_all(api_key.as_bytes())
            .map_err(|error| format!("保存 API Key 失败：{error}"))?;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("设置 API Key 文件权限失败：{error}"))?;
    }

    #[cfg(not(unix))]
    std::fs::write(&path, api_key).map_err(|error| format!("保存 API Key 失败：{error}"))?;

    Ok(())
}

pub fn read_api_key(data_dir: &Path) -> Result<String, String> {
    let path = api_key_path(data_dir);
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path)
        .map(|key| key.trim().to_string())
        .map_err(|error| format!("读取 API Key 失败：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!("yuejian-r7-credentials-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn api_key_round_trip_overwrite_and_clear() {
        let dir = temp_dir();
        write_api_key(&dir, "first-secret").unwrap();
        assert_eq!(read_api_key(&dir).unwrap(), "first-secret");
        write_api_key(&dir, "second-secret").unwrap();
        assert_eq!(read_api_key(&dir).unwrap(), "second-secret");

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(api_key_path(&dir))
                .unwrap()
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(mode, 0o600);
        }

        write_api_key(&dir, "").unwrap();
        assert_eq!(read_api_key(&dir).unwrap(), "");
        assert!(!api_key_path(&dir).exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
