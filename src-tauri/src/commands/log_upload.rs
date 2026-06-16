use base64::{engine::general_purpose, Engine as _};
use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

const SCAN_LOG_DIR: &str = "logs";
const SCAN_KEY_DIRS: [&str; 2] = ["storage", "Code Cache"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareLogUploadRequest {
    pub login_id: String,
    pub password_date_key: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareLogUploadResult {
    pub success: bool,
    pub msg: String,
    pub filename: String,
    pub file_size: usize,
    pub body_base64: String,
    pub password: String,
}

#[derive(Clone)]
struct ZipEntry {
    name: String,
    data: Vec<u8>,
}

fn is_data_instance_name(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();
    upper
        .strip_prefix("DATA_")
        .map(|tail| !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit()))
        .unwrap_or(false)
}

fn is_account_config_name(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with("-account-config.json")
}

fn is_friend_key_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with("-friend-keys-objs.json") || lower.ends_with("-friend-key-objs.json")
}

fn is_channel_key_name(name: &str) -> bool {
    name.to_ascii_lowercase()
        .ends_with("-channel-key-objs.json")
}

fn is_group_key_name(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with("-group-key-objs.json")
}

fn normalize_key_filename(name: &str) -> String {
    let lower = name.to_ascii_lowercase();
    if lower.starts_with("ocs-storage-") {
        name["ocs-storage-".len()..].to_string()
    } else {
        name.to_string()
    }
}

fn strip_suffix_case_insensitive<'a>(name: &'a str, suffix: &str) -> Option<&'a str> {
    if name.to_ascii_lowercase().ends_with(suffix) {
        Some(&name[..name.len().saturating_sub(suffix.len())])
    } else {
        None
    }
}

fn key_upload_entry_name(instance: &str, normalized_name: &str) -> Option<String> {
    let suffixes = [
        ("-account-config.json", "dc"),
        ("-friend-keys-objs.json", "fnk"),
        ("-friend-key-objs.json", "fnk"),
        ("-channel-key-objs.json", "cnk"),
        ("-group-key-objs.json", "gnk"),
    ];

    for (suffix, short_tag) in suffixes {
        if let Some(uid) = strip_suffix_case_insensitive(normalized_name, suffix) {
            return Some(format!("{}-{}-{}", instance, uid, short_tag));
        }
    }
    None
}

fn walk_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            walk_files(&path, out);
        } else if file_type.is_file() {
            out.push(path);
        }
    }
}

fn collect_instance_files(instance_dir: &Path, instance: &str) -> Vec<(String, PathBuf)> {
    let mut files = Vec::new();
    let mut log_paths = Vec::new();
    walk_files(&instance_dir.join(SCAN_LOG_DIR), &mut log_paths);
    for path in log_paths {
        let Some(filename) = path.file_name().and_then(|v| v.to_str()) else {
            continue;
        };
        files.push((format!("{}-{}", instance, filename), path));
    }

    let mut seen_normalized_names = HashSet::new();
    for key_dir in SCAN_KEY_DIRS {
        let cache_root = instance_dir.join(key_dir);
        if let Ok(entries) = fs::read_dir(cache_root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let raw_name = entry.file_name().to_string_lossy().to_string();
                let normalized_name = normalize_key_filename(&raw_name);
                let normalized_key = normalized_name.to_ascii_lowercase();
                if seen_normalized_names.contains(&normalized_key) {
                    continue;
                }
                if !(is_account_config_name(&normalized_name)
                    || is_friend_key_name(&normalized_name)
                    || is_channel_key_name(&normalized_name)
                    || is_group_key_name(&normalized_name))
                {
                    continue;
                }
                if let Some(entry_name) = key_upload_entry_name(instance, &normalized_name) {
                    files.push((entry_name, path));
                    seen_normalized_names.insert(normalized_key);
                }
            }
        }
    }

    files
}

fn collect_log_upload_files(app_data_dir: &Path) -> Vec<(String, PathBuf)> {
    let mut result = Vec::new();

    result.extend(collect_instance_files(app_data_dir, "DATA_0"));

    if let Ok(entries) = fs::read_dir(app_data_dir) {
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if !file_type.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if !is_data_instance_name(&name) {
                continue;
            }
            result.extend(collect_instance_files(&entry.path(), &name));
        }
    }

    result
}

fn unique_zip_name(used: &mut HashSet<String>, base: String) -> String {
    if used.insert(base.clone()) {
        return base;
    }

    let path = Path::new(&base);
    let stem = path
        .file_stem()
        .and_then(|v| v.to_str())
        .unwrap_or("file")
        .to_string();
    let ext = path.extension().and_then(|v| v.to_str()).unwrap_or("");

    for index in 1.. {
        let candidate = if ext.is_empty() {
            format!("{}-{}", stem, index)
        } else {
            format!("{}-{}.{}", stem, index, ext)
        };
        if used.insert(candidate.clone()) {
            return candidate;
        }
    }

    base
}

fn format_now() -> String {
    chrono::Local::now().format("%Y%m%d%H%M%S").to_string()
}

fn date_md5_password(date_key: &str) -> String {
    let input = date_key.trim();
    if input.is_empty() {
        return String::new();
    }
    let mut hasher = Md5::new();
    hasher.update(input.as_bytes());
    let hex = format!("{:x}", hasher.finalize());
    hex.chars().take(10).collect()
}

fn create_password_zip_with_system(
    entries: &[ZipEntry],
    password: &str,
) -> Result<Vec<u8>, String> {
    if password.trim().is_empty() {
        return Err("password is empty".to_string());
    }

    let temp_dir = std::env::temp_dir().join(format!("ocs-log-upload-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&temp_dir).map_err(|e| format!("create log temp dir failed: {}", e))?;
    let zip_path = temp_dir.join("log.zip");
    let mut file_paths = Vec::new();

    let result = (|| {
        for entry in entries {
            let path = temp_dir.join(&entry.name);
            fs::write(&path, &entry.data)
                .map_err(|e| format!("write log temp file failed {}: {}", entry.name, e))?;
            file_paths.push(path);
        }

        let mut command = Command::new("zip");
        command
            .arg("-j")
            .arg("-q")
            .arg("-P")
            .arg(password)
            .arg(&zip_path);
        for path in &file_paths {
            command.arg(path);
        }

        let output = command
            .output()
            .map_err(|e| format!("system zip unavailable: {}", e))?;
        if !output.status.success() {
            return Err(format!(
                "system zip failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        fs::read(&zip_path).map_err(|e| format!("read zipped log package failed: {}", e))
    })();

    let _ = fs::remove_dir_all(&temp_dir);
    result
}

fn build_zip_entries(app_data_dir: &Path) -> Result<Vec<ZipEntry>, String> {
    let mut used = HashSet::new();
    let mut entries = Vec::new();
    for (entry_name, source_path) in collect_log_upload_files(app_data_dir) {
        let data = fs::read(&source_path)
            .map_err(|e| format!("read log file failed {}: {}", source_path.display(), e))?;
        let name = unique_zip_name(&mut used, entry_name);
        entries.push(ZipEntry { name, data });
    }
    Ok(entries)
}

#[tauri::command]
pub fn prepare_log_upload_package(
    app: tauri::AppHandle,
    request: PrepareLogUploadRequest,
) -> Result<PrepareLogUploadResult, String> {
    let login_id = request.login_id.trim();
    if login_id.is_empty() {
        return Ok(PrepareLogUploadResult {
            success: false,
            msg: "loginId is required".to_string(),
            filename: String::new(),
            file_size: 0,
            body_base64: String::new(),
            password: String::new(),
        });
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir failed: {}", e))?;
    let entries = build_zip_entries(&app_data_dir)?;
    if entries.is_empty() {
        return Ok(PrepareLogUploadResult {
            success: false,
            msg: "logs/* and key files are not found".to_string(),
            filename: String::new(),
            file_size: 0,
            body_base64: String::new(),
            password: String::new(),
        });
    }

    let filename = format!("{}-{}.zip", login_id, format_now());
    let password = date_md5_password(request.password_date_key.as_deref().unwrap_or(""));
    let zip = create_password_zip_with_system(&entries, &password)?;
    if zip.is_empty() {
        return Err("create log zip failed".to_string());
    }
    let file_size = zip.len();
    tracing::info!(
        target: "post-log-upload",
        "prepared log package entries={} bytes={} filename={}",
        entries.len(),
        file_size,
        filename
    );

    Ok(PrepareLogUploadResult {
        success: true,
        msg: "package prepared".to_string(),
        filename,
        file_size,
        body_base64: general_purpose::STANDARD.encode(zip),
        password,
    })
}

#[cfg(test)]
mod tests {
    use super::{collect_log_upload_files, date_md5_password};
    use std::fs;

    fn temp_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("log-upload-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn collects_storage_and_normalizes_key_names_like_old_im() {
        let root = temp_dir();
        let logs = root.join("logs");
        let storage = root.join("storage");
        let code_cache = root.join("Code Cache");
        fs::create_dir_all(&logs).unwrap();
        fs::create_dir_all(&storage).unwrap();
        fs::create_dir_all(&code_cache).unwrap();
        fs::write(logs.join("app.log"), b"log").unwrap();
        fs::write(
            storage.join("ocs-storage-100-account-config.json"),
            b"account",
        )
        .unwrap();
        fs::write(storage.join("100-friend-keys-objs.json"), b"friend").unwrap();
        fs::write(code_cache.join("100-friend-keys-objs.json"), b"duplicate").unwrap();
        fs::write(storage.join("100-channel-key-objs.json"), b"channel").unwrap();
        fs::write(storage.join("100-group-key-objs.json"), b"group").unwrap();

        let mut names = collect_log_upload_files(&root)
            .into_iter()
            .map(|(name, _)| name)
            .collect::<Vec<_>>();
        names.sort();

        assert_eq!(
            names,
            vec![
                "DATA_0-100-cnk",
                "DATA_0-100-dc",
                "DATA_0-100-fnk",
                "DATA_0-100-gnk",
                "DATA_0-app.log",
            ]
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn derives_zip_password_from_upload_date_key() {
        assert_eq!(date_md5_password("202606/16"), "8093361e57");
    }
}
