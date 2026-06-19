use base64::{engine::general_purpose, Engine as _};
use md5::{Digest, Md5};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
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

fn crc32_update(crc: u32, byte: u8) -> u32 {
    let mut value = crc ^ u32::from(byte);
    for _ in 0..8 {
        if value & 1 == 1 {
            value = (value >> 1) ^ 0xedb88320;
        } else {
            value >>= 1;
        }
    }
    value
}

fn crc32_bytes(data: &[u8]) -> u32 {
    let crc = data
        .iter()
        .fold(0xffffffff, |crc, byte| crc32_update(crc, *byte));
    !crc
}

struct ZipCrypto {
    key0: u32,
    key1: u32,
    key2: u32,
}

impl ZipCrypto {
    fn new(password: &[u8]) -> Self {
        let mut crypto = Self {
            key0: 0x12345678,
            key1: 0x23456789,
            key2: 0x34567890,
        };
        for byte in password {
            crypto.update_keys(*byte);
        }
        crypto
    }

    fn update_keys(&mut self, byte: u8) {
        self.key0 = crc32_update(self.key0, byte);
        self.key1 = self
            .key1
            .wrapping_add(self.key0 & 0xff)
            .wrapping_mul(134775813)
            .wrapping_add(1);
        self.key2 = crc32_update(self.key2, (self.key1 >> 24) as u8);
    }

    fn encrypt_byte(&mut self, plain: u8) -> u8 {
        let temp = self.key2 | 2;
        let mask = ((temp.wrapping_mul(temp ^ 1)) >> 8) as u8;
        let encrypted = plain ^ mask;
        self.update_keys(plain);
        encrypted
    }

    fn encrypt(&mut self, data: &[u8]) -> Vec<u8> {
        data.iter().map(|byte| self.encrypt_byte(*byte)).collect()
    }
}

#[derive(Clone)]
struct WrittenZipEntry {
    name: String,
    crc32: u32,
    compressed_size: u32,
    uncompressed_size: u32,
    local_header_offset: u32,
}

fn push_u16_le(out: &mut Vec<u8>, value: u16) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_u32_le(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn checked_u32(value: usize, label: &str) -> Result<u32, String> {
    u32::try_from(value).map_err(|_| format!("{} too large for zip32", label))
}

fn checked_u16(value: usize, label: &str) -> Result<u16, String> {
    u16::try_from(value).map_err(|_| format!("{} too long for zip", label))
}

fn encrypted_zip_payload(entry: &ZipEntry, password: &str, crc32: u32) -> Vec<u8> {
    let mut header = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut header[..11]);
    // 保持旧 im `zip -P` 的 ZipCrypto 兼容格式：第 12 字节用 CRC 高位校验密码。
    header[11] = (crc32 >> 24) as u8;

    let mut crypto = ZipCrypto::new(password.as_bytes());
    let mut payload = crypto.encrypt(&header);
    payload.extend(crypto.encrypt(&entry.data));
    payload
}

fn create_password_zip(entries: &[ZipEntry], password: &str) -> Result<Vec<u8>, String> {
    if password.trim().is_empty() {
        return Err("password is empty".to_string());
    }

    let mut out = Vec::new();
    let mut written_entries = Vec::new();
    let mod_time = 0u16;
    let mod_date = 33u16; // 1980-01-01, the DOS date lower bound used by ZIP.
    let flags = 0x0801u16; // encrypted + UTF-8 filename

    for entry in entries {
        let name_bytes = entry.name.as_bytes();
        let name_len = checked_u16(name_bytes.len(), "zip entry name")?;
        let crc32 = crc32_bytes(&entry.data);
        let encrypted_payload = encrypted_zip_payload(entry, password, crc32);
        let compressed_size = checked_u32(encrypted_payload.len(), "zip entry payload")?;
        let uncompressed_size = checked_u32(entry.data.len(), "zip entry data")?;
        let local_header_offset = checked_u32(out.len(), "zip local header offset")?;

        push_u32_le(&mut out, 0x04034b50);
        push_u16_le(&mut out, 20);
        push_u16_le(&mut out, flags);
        push_u16_le(&mut out, 0);
        push_u16_le(&mut out, mod_time);
        push_u16_le(&mut out, mod_date);
        push_u32_le(&mut out, crc32);
        push_u32_le(&mut out, compressed_size);
        push_u32_le(&mut out, uncompressed_size);
        push_u16_le(&mut out, name_len);
        push_u16_le(&mut out, 0);
        out.extend_from_slice(name_bytes);
        out.extend_from_slice(&encrypted_payload);

        written_entries.push(WrittenZipEntry {
            name: entry.name.clone(),
            crc32,
            compressed_size,
            uncompressed_size,
            local_header_offset,
        });
    }

    let central_directory_offset = checked_u32(out.len(), "zip central directory offset")?;
    for entry in &written_entries {
        let name_bytes = entry.name.as_bytes();
        let name_len = checked_u16(name_bytes.len(), "zip central entry name")?;
        push_u32_le(&mut out, 0x02014b50);
        push_u16_le(&mut out, 20);
        push_u16_le(&mut out, 20);
        push_u16_le(&mut out, flags);
        push_u16_le(&mut out, 0);
        push_u16_le(&mut out, mod_time);
        push_u16_le(&mut out, mod_date);
        push_u32_le(&mut out, entry.crc32);
        push_u32_le(&mut out, entry.compressed_size);
        push_u32_le(&mut out, entry.uncompressed_size);
        push_u16_le(&mut out, name_len);
        push_u16_le(&mut out, 0);
        push_u16_le(&mut out, 0);
        push_u16_le(&mut out, 0);
        push_u16_le(&mut out, 0);
        push_u32_le(&mut out, 0);
        push_u32_le(&mut out, entry.local_header_offset);
        out.extend_from_slice(name_bytes);
    }

    let central_directory_size = checked_u32(
        out.len().saturating_sub(central_directory_offset as usize),
        "zip central directory size",
    )?;
    let entry_count = checked_u16(written_entries.len(), "zip entry count")?;
    push_u32_le(&mut out, 0x06054b50);
    push_u16_le(&mut out, 0);
    push_u16_le(&mut out, 0);
    push_u16_le(&mut out, entry_count);
    push_u16_le(&mut out, entry_count);
    push_u32_le(&mut out, central_directory_size);
    push_u32_le(&mut out, central_directory_offset);
    push_u16_le(&mut out, 0);

    Ok(out)
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
    let zip = create_password_zip(&entries, &password)?;
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
    use super::{collect_log_upload_files, create_password_zip, date_md5_password, ZipEntry};
    use std::fs;
    use std::io::{Cursor, Read};

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
    fn creates_password_zip_without_system_zip_command() {
        let entries = vec![ZipEntry {
            name: "DATA_0-app.log".to_string(),
            data: b"hello log".to_vec(),
        }];
        let zip_bytes = create_password_zip(&entries, "8093361e57").unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(zip_bytes)).unwrap();
        let mut file = archive
            .by_name_decrypt("DATA_0-app.log", b"8093361e57")
            .unwrap();
        let mut text = String::new();
        file.read_to_string(&mut text).unwrap();

        assert_eq!(text, "hello log");
    }
}
