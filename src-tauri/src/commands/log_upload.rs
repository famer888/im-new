use base64::{engine::general_purpose, Engine as _};
use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

const SCAN_LOG_DIR: &str = "logs";
const SCAN_KEY_DIR: &str = "Code Cache";

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
    crc32: u32,
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

fn collect_instance_files(instance_dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    walk_files(&instance_dir.join(SCAN_LOG_DIR), &mut files);

    let cache_root = instance_dir.join(SCAN_KEY_DIR);
    if let Ok(entries) = fs::read_dir(cache_root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if is_account_config_name(&name)
                || is_friend_key_name(&name)
                || is_channel_key_name(&name)
                || is_group_key_name(&name)
            {
                files.push(path);
            }
        }
    }

    files
}

fn collect_log_upload_files(app_data_dir: &Path) -> Vec<(String, PathBuf)> {
    let mut result = Vec::new();

    for path in collect_instance_files(app_data_dir) {
        result.push(("DATA_0".to_string(), path));
    }

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
            for path in collect_instance_files(&entry.path()) {
                result.push((name.clone(), path));
            }
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

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffff_u32;
    for byte in bytes {
        crc ^= *byte as u32;
        for _ in 0..8 {
            let mask = if crc & 1 == 1 { 0xedb8_8320 } else { 0 };
            crc = (crc >> 1) ^ mask;
        }
    }
    !crc
}

fn dos_datetime_now() -> (u16, u16) {
    use chrono::{Datelike, Timelike};
    let now = chrono::Local::now();
    let year = now.year().clamp(1980, 2107) as u16;
    let date = ((year - 1980) << 9) | ((now.month() as u16) << 5) | now.day() as u16;
    let time =
        ((now.hour() as u16) << 11) | ((now.minute() as u16) << 5) | ((now.second() as u16) / 2);
    (time, date)
}

fn push_u16(out: &mut Vec<u8>, value: u16) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn create_stored_zip(entries: &[ZipEntry]) -> Result<Vec<u8>, String> {
    let (dos_time, dos_date) = dos_datetime_now();
    let mut out = Vec::new();
    let mut central = Vec::new();

    for entry in entries {
        let name = entry.name.as_bytes();
        if name.len() > u16::MAX as usize {
            return Err(format!("zip entry name too long: {}", entry.name));
        }
        if entry.data.len() > u32::MAX as usize || out.len() > u32::MAX as usize {
            return Err("log package is too large".to_string());
        }

        let offset = out.len() as u32;
        let size = entry.data.len() as u32;

        push_u32(&mut out, 0x0403_4b50);
        push_u16(&mut out, 20);
        push_u16(&mut out, 0);
        push_u16(&mut out, 0);
        push_u16(&mut out, dos_time);
        push_u16(&mut out, dos_date);
        push_u32(&mut out, entry.crc32);
        push_u32(&mut out, size);
        push_u32(&mut out, size);
        push_u16(&mut out, name.len() as u16);
        push_u16(&mut out, 0);
        out.extend_from_slice(name);
        out.extend_from_slice(&entry.data);

        push_u32(&mut central, 0x0201_4b50);
        push_u16(&mut central, 20);
        push_u16(&mut central, 20);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, dos_time);
        push_u16(&mut central, dos_date);
        push_u32(&mut central, entry.crc32);
        push_u32(&mut central, size);
        push_u32(&mut central, size);
        push_u16(&mut central, name.len() as u16);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u32(&mut central, 0);
        push_u32(&mut central, offset);
        central.extend_from_slice(name);
    }

    if entries.len() > u16::MAX as usize
        || central.len() > u32::MAX as usize
        || out.len() > u32::MAX as usize
    {
        return Err("log package is too large".to_string());
    }

    let central_offset = out.len() as u32;
    let central_size = central.len() as u32;
    out.extend_from_slice(&central);
    push_u32(&mut out, 0x0605_4b50);
    push_u16(&mut out, 0);
    push_u16(&mut out, 0);
    push_u16(&mut out, entries.len() as u16);
    push_u16(&mut out, entries.len() as u16);
    push_u32(&mut out, central_size);
    push_u32(&mut out, central_offset);
    push_u16(&mut out, 0);

    Ok(out)
}

fn create_password_zip_with_system(entries: &[ZipEntry], password: &str) -> Result<Vec<u8>, String> {
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
        command.arg("-j").arg("-q").arg("-P").arg(password).arg(&zip_path);
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
    for (instance, source_path) in collect_log_upload_files(app_data_dir) {
        let Some(filename) = source_path.file_name().and_then(|v| v.to_str()) else {
            continue;
        };
        let data = fs::read(&source_path)
            .map_err(|e| format!("read log file failed {}: {}", source_path.display(), e))?;
        let name = unique_zip_name(&mut used, format!("{}-{}", instance, filename));
        let crc32 = crc32(&data);
        entries.push(ZipEntry { name, data, crc32 });
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
    let zip = create_password_zip_with_system(&entries, &password)
        .unwrap_or_else(|_| create_stored_zip(&entries).unwrap_or_default());
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
