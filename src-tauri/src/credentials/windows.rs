use std::fs;
use std::io::{Error, ErrorKind};
use std::path::Path;
use std::sync::Mutex;
use windows_sys::Win32::Foundation::ERROR_NOT_FOUND;
use windows_sys::Win32::Security::Credentials::{
    CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_MAX_CREDENTIAL_BLOB_SIZE,
    CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
};

// A model request can read during a settings save. Serialize legacy migration with both.
static ACCESS: Mutex<()> = Mutex::new(());

fn target(data_dir: &Path) -> Vec<u16> {
    format!("com.yuejian.reader/model-api-key/{}", data_dir.display())
        .encode_utf16()
        .chain(Some(0))
        .collect()
}

fn remove_legacy(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("清理旧 API Key 文件失败：{error}")),
    }
}

fn read_system(target: &[u16]) -> Result<Option<String>, String> {
    let mut record = std::ptr::null_mut();
    // CredReadW returns a single allocation owned by the caller on success.
    if unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut record) } == 0 {
        let error = Error::last_os_error();
        return if error.raw_os_error() == Some(ERROR_NOT_FOUND as i32) {
            Ok(None)
        } else {
            Err(format!("读取 Windows 凭据失败：{error}"))
        };
    }
    let value = unsafe {
        let size = (*record).CredentialBlobSize as usize;
        let bytes = if size == 0 {
            &[]
        } else {
            std::slice::from_raw_parts((*record).CredentialBlob, size)
        };
        let value = std::str::from_utf8(bytes).map(str::to_owned);
        CredFree(record.cast());
        value
    };
    value
        .map(Some)
        .map_err(|_| "Windows 凭据内容不是 UTF-8".into())
}

fn store(target: &mut [u16], key: &str) -> Result<(), String> {
    if key.len() > CRED_MAX_CREDENTIAL_BLOB_SIZE as usize {
        return Err(format!(
            "API Key 超过 Windows 凭据的 {} 字节上限",
            CRED_MAX_CREDENTIAL_BLOB_SIZE
        ));
    }
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: target.as_mut_ptr(),
        CredentialBlob: key.as_ptr().cast_mut(),
        CredentialBlobSize: key.len() as u32,
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        ..Default::default()
    };
    // CredWriteW copies the supplied input buffers before returning.
    if unsafe { CredWriteW(&credential, 0) } == 0 {
        return Err(format!("保存 Windows 凭据失败：{}", Error::last_os_error()));
    }
    Ok(())
}

pub fn read_api_key(data_dir: &Path) -> Result<String, String> {
    let _guard = ACCESS.lock().map_err(|_| "凭据锁异常，请重启应用")?;
    let mut target = target(data_dir);
    let path = super::api_key_path(data_dir);
    if let Some(value) = read_system(&target)? {
        remove_legacy(&path)?;
        return Ok(value);
    }
    let legacy = match fs::read_to_string(&path) {
        Ok(value) => value,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(String::new()),
        Err(error) => return Err(format!("读取旧 API Key 文件失败：{error}")),
    };
    let key = legacy.trim();
    if !key.is_empty() {
        store(&mut target, key)?;
    }
    remove_legacy(&path)?;
    Ok(key.to_owned())
}

pub fn write_api_key(data_dir: &Path, api_key: &str) -> Result<(), String> {
    let _guard = ACCESS.lock().map_err(|_| "凭据锁异常，请重启应用")?;
    let mut target = target(data_dir);
    let path = super::api_key_path(data_dir);
    let key = api_key.trim();
    if key.is_empty() {
        // Remove the fallback first so clearing cannot resurrect an older key.
        remove_legacy(&path)?;
        if unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) } == 0 {
            let error = Error::last_os_error();
            if error.raw_os_error() != Some(ERROR_NOT_FOUND as i32) {
                return Err(format!("清除 Windows 凭据失败：{error}"));
            }
        }
        return Ok(());
    }
    store(&mut target, key)?;
    remove_legacy(&path)
}
