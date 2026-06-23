use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::{AesMode, CompressionMethod, ZipWriter};

const SCAN_LOG_DIR: &str = "logs";
const SCAN_KEY_DIRS: [&str; 2] = ["storage", "Code Cache"];
const LOG_UPLOAD_TEMP_PREFIX: &str = "post-log-upload-";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareLogUploadRequest {
    pub login_id: String,
    pub password_date_key: Option<String>,
    pub progress_event: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareLogUploadResult {
    pub success: bool,
    pub msg: String,
    pub filename: String,
    pub file_size: u64,
    pub file_path: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupLogUploadRequest {
    pub file_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupLogUploadResult {
    pub success: bool,
    pub msg: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogUploadProgress {
    progress: f64,
    total_bytes: u64,
    processed_bytes: u64,
    status: String,
}

struct ProgressTarget {
    app: tauri::AppHandle,
    event_name: String,
}

#[derive(Clone)]
struct ZipEntry {
    name: String,
    path: PathBuf,
    size: u64,
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

fn build_zip_entries(app_data_dir: &Path) -> Result<Vec<ZipEntry>, String> {
    let mut used = HashSet::new();
    let mut entries = Vec::new();
    for (entry_name, source_path) in collect_log_upload_files(app_data_dir) {
        let metadata = fs::metadata(&source_path)
            .map_err(|e| format!("stat log file failed {}: {}", source_path.display(), e))?;
        if !metadata.is_file() {
            continue;
        }
        let name = unique_zip_name(&mut used, entry_name);
        entries.push(ZipEntry {
            name,
            path: source_path,
            size: metadata.len(),
        });
    }
    Ok(entries)
}

fn emit_progress(
    target: Option<&ProgressTarget>,
    progress: f64,
    processed_bytes: u64,
    total_bytes: u64,
    status: &str,
) {
    if let Some(target) = target {
        let _ = target.app.emit(
            &target.event_name,
            LogUploadProgress {
                progress: progress.clamp(0.0, 1.0),
                processed_bytes,
                total_bytes,
                status: status.to_string(),
            },
        );
    }
}

fn create_password_zip_file(
    entries: &[ZipEntry],
    password: &str,
    zip_path: &Path,
    progress_target: Option<&ProgressTarget>,
) -> Result<u64, String> {
    if password.trim().is_empty() {
        return Err("password is empty".to_string());
    }

    let file = fs::File::create(zip_path)
        .map_err(|e| format!("create log zip failed {}: {}", zip_path.display(), e))?;
    let mut zip = ZipWriter::new(BufWriter::new(file));
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .compression_level(Some(9))
        .large_file(true)
        .with_aes_encryption(AesMode::Aes256, password);
    let total_bytes = entries.iter().map(|entry| entry.size).sum::<u64>();
    let mut processed_bytes = 0u64;

    // 对齐旧 im：日志包仍采集全部 logs/key 文件，但在 Rust 侧边读边压缩写入临时 zip，避免把大日志整体堆进内存。
    for entry in entries {
        zip.start_file(&entry.name, options.clone())
            .map_err(|e| format!("start zip entry failed {}: {}", entry.name, e))?;

        let mut source = BufReader::new(
            fs::File::open(&entry.path)
                .map_err(|e| format!("open log file failed {}: {}", entry.path.display(), e))?,
        );
        let mut buffer = vec![0u8; 256 * 1024];
        loop {
            let read = source
                .read(&mut buffer)
                .map_err(|e| format!("read log file failed {}: {}", entry.path.display(), e))?;
            if read == 0 {
                break;
            }
            zip.write_all(&buffer[..read])
                .map_err(|e| format!("write log zip failed {}: {}", entry.name, e))?;
            processed_bytes = processed_bytes.saturating_add(read as u64);
            let progress = if total_bytes > 0 {
                processed_bytes as f64 / total_bytes as f64
            } else {
                1.0
            };
            emit_progress(
                progress_target,
                progress,
                processed_bytes,
                total_bytes,
                "packaging",
            );
        }
    }

    let mut writer = zip
        .finish()
        .map_err(|e| format!("finish log zip failed: {}", e))?;
    writer
        .flush()
        .map_err(|e| format!("flush log zip failed: {}", e))?;
    emit_progress(progress_target, 1.0, total_bytes, total_bytes, "packaged");

    fs::metadata(zip_path)
        .map(|metadata| metadata.len())
        .map_err(|e| format!("stat log zip failed {}: {}", zip_path.display(), e))
}

fn make_empty_result(msg: &str) -> PrepareLogUploadResult {
    PrepareLogUploadResult {
        success: false,
        msg: msg.to_string(),
        filename: String::new(),
        file_size: 0,
        file_path: String::new(),
        password: String::new(),
    }
}

fn prepare_log_upload_package_inner(
    app: tauri::AppHandle,
    request: PrepareLogUploadRequest,
) -> Result<PrepareLogUploadResult, String> {
    let login_id = request.login_id.trim();
    if login_id.is_empty() {
        return Ok(make_empty_result("loginId is required"));
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir failed: {}", e))?;
    let entries = build_zip_entries(&app_data_dir)?;
    if entries.is_empty() {
        return Ok(make_empty_result("logs/* and key files are not found"));
    }

    let filename = format!("{}-{}.zip", login_id, format_now());
    let password = date_md5_password(request.password_date_key.as_deref().unwrap_or(""));
    let temp_dir =
        std::env::temp_dir().join(format!("{}{}", LOG_UPLOAD_TEMP_PREFIX, Uuid::new_v4()));
    let zip_path = temp_dir.join(&filename);
    let progress_target = request
        .progress_event
        .filter(|event| !event.trim().is_empty())
        .map(|event_name| ProgressTarget {
            app: app.clone(),
            event_name,
        });

    let file_size = match (|| {
        fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("create log upload temp dir failed: {}", e))?;
        create_password_zip_file(&entries, &password, &zip_path, progress_target.as_ref())
    })() {
        Ok(file_size) => file_size,
        Err(error) => {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(error);
        }
    };
    if file_size == 0 {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("create log zip failed".to_string());
    }

    tracing::info!(
        target: "post-log-upload",
        "prepared log package entries={} bytes={} filename={} path={}",
        entries.len(),
        file_size,
        filename,
        zip_path.display()
    );

    Ok(PrepareLogUploadResult {
        success: true,
        msg: "package prepared".to_string(),
        filename,
        file_size,
        file_path: zip_path.to_string_lossy().to_string(),
        password,
    })
}

#[tauri::command]
pub async fn prepare_log_upload_package(
    app: tauri::AppHandle,
    request: PrepareLogUploadRequest,
) -> Result<PrepareLogUploadResult, String> {
    tokio::task::spawn_blocking(move || prepare_log_upload_package_inner(app, request))
        .await
        .map_err(|e| format!("prepare log package task failed: {}", e))?
}

fn cleanup_log_upload_package_path(file_path: &Path) -> Result<(), String> {
    let temp_dir = file_path
        .parent()
        .ok_or_else(|| "invalid log package path".to_string())?;
    let temp_root = std::env::temp_dir()
        .canonicalize()
        .map_err(|e| format!("resolve temp dir failed: {}", e))?;
    let resolved_temp_dir = temp_dir
        .canonicalize()
        .map_err(|e| format!("resolve log package dir failed: {}", e))?;
    let dir_name = resolved_temp_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();

    // 只允许清理本次日志上传创建的系统临时子目录，避免前端传入任意路径造成误删。
    if resolved_temp_dir == temp_root
        || !resolved_temp_dir.starts_with(&temp_root)
        || !dir_name.starts_with(LOG_UPLOAD_TEMP_PREFIX)
    {
        return Err("invalid log package temp path".to_string());
    }

    fs::remove_dir_all(&resolved_temp_dir).map_err(|e| format!("cleanup log package failed: {}", e))
}

#[tauri::command]
pub fn cleanup_log_upload_package(
    request: CleanupLogUploadRequest,
) -> Result<CleanupLogUploadResult, String> {
    if request.file_path.trim().is_empty() {
        return Ok(CleanupLogUploadResult {
            success: false,
            msg: "filePath is required".to_string(),
        });
    }

    cleanup_log_upload_package_path(Path::new(&request.file_path)).map(|_| CleanupLogUploadResult {
        success: true,
        msg: "cleanup success".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::{
        cleanup_log_upload_package_path, collect_log_upload_files, create_password_zip_file,
        date_md5_password, ZipEntry, LOG_UPLOAD_TEMP_PREFIX,
    };
    use std::fs;
    use std::io::{Cursor, Read};
    use zip::ZipArchive;

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

    #[test]
    fn creates_aes_deflated_log_zip_file() {
        let root = temp_dir();
        let source_path = root.join("app.log");
        let zip_path = root.join("log.zip");
        fs::write(&source_path, b"hello log").unwrap();
        let entries = vec![ZipEntry {
            name: "DATA_0-app.log".to_string(),
            path: source_path,
            size: 9,
        }];

        let file_size = create_password_zip_file(&entries, "8093361e57", &zip_path, None).unwrap();
        assert!(file_size > 0);

        let zip_bytes = fs::read(&zip_path).unwrap();
        let mut archive = ZipArchive::new(Cursor::new(zip_bytes)).unwrap();
        let mut file = archive
            .by_name_decrypt("DATA_0-app.log", b"8093361e57")
            .unwrap();
        let mut text = String::new();
        file.read_to_string(&mut text).unwrap();

        assert_eq!(text, "hello log");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cleanup_only_removes_owned_temp_package_dir() {
        let root = std::env::temp_dir().join(format!(
            "{}{}",
            LOG_UPLOAD_TEMP_PREFIX,
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).unwrap();
        let zip_path = root.join("log.zip");
        fs::write(&zip_path, b"zip").unwrap();

        cleanup_log_upload_package_path(&zip_path).unwrap();
        assert!(!root.exists());

        let unrelated = temp_dir().join("log.zip");
        fs::write(&unrelated, b"zip").unwrap();
        assert!(cleanup_log_upload_package_path(&unrelated).is_err());
        fs::remove_dir_all(unrelated.parent().unwrap()).unwrap();
    }
}
