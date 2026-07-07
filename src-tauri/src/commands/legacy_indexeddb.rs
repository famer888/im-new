use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Map, Value};
use tracing::{info, warn};

use crate::branding;

/// 旧 Electron 桌面端 userData 目录（覆盖安装后仍保留）。
pub fn legacy_electron_user_data_paths(brand_id: &str) -> Vec<PathBuf> {
    let brand_id = branding::normalize_brand_id(brand_id);
    let mut paths = Vec::new();
    let mut seen = BTreeSet::new();

    let mut push = |brand: &str| {
        if let Some(path) = platform_user_data_path(&branding::legacy_electron_user_data_name(brand)) {
            if path.is_dir() && seen.insert(path.clone()) {
                paths.push(path);
            }
        }
    };

    push(brand_id);
    if brand_id != "97" {
        push("97");
    }

    paths
}

fn platform_user_data_path(app_name: &str) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        return dirs::home_dir().map(|home| {
            home.join("Library")
                .join("Application Support")
                .join(app_name)
        });
    }

    #[cfg(target_os = "windows")]
    {
        return dirs::data_dir().map(|data| data.join(app_name));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app_name;
        None
    }
}

/// 从旧 Electron IndexedDB LevelDB 文件扫描单聊/群聊/频道消息表。
pub fn extract_history_from_user_data(user_data: &Path, uid: &str) -> Map<String, Value> {
    let blob = read_indexeddb_blob(user_data);
    if blob.is_empty() {
        return Map::new();
    }
    extract_history_from_blob(&blob, uid)
}

fn read_indexeddb_blob(user_data: &Path) -> Vec<u8> {
    let indexeddb_dir = user_data.join("IndexedDB");
    if !indexeddb_dir.is_dir() {
        return Vec::new();
    }

    let mut files = Vec::new();
    collect_idb_files(&indexeddb_dir, &mut files);
    files.sort();

    let mut blob = Vec::new();
    for path in files {
        match fs::read(&path) {
            Ok(bytes) => blob.extend_from_slice(&bytes),
            Err(err) => {
                warn!(
                    "[legacy-indexeddb] failed to read {:?}: {}",
                    path, err
                );
            }
        }
    }
    blob
}

fn collect_idb_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_idb_files(&path, out);
            continue;
        }
        let is_idb_file = path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext == "ldb" || ext == "log");
        if is_idb_file {
            out.push(path);
        }
    }
}

fn extract_history_from_blob(blob: &[u8], uid: &str) -> Map<String, Value> {
    let text = String::from_utf8_lossy(blob);
    let tables = find_legacy_tables(&text, uid);
    if tables.is_empty() {
        return Map::new();
    }

    let mut history = Map::new();
    for table in tables {
        let rows = extract_rows_for_table(&text, &table);
        if !rows.is_empty() {
            history.insert(table, Value::Array(rows));
        }
    }
    history
}

fn find_legacy_tables(text: &str, uid: &str) -> Vec<String> {
    let prefixes = [
        format!("{uid}-message.man"),
        format!("{uid}-groupMessage.man"),
        format!("{uid}-channelMessage.man"),
    ];

    let mut tables = BTreeSet::new();
    for prefix in prefixes {
        let mut start = 0usize;
        while let Some(rel) = text[start..].find(&prefix) {
            let idx = start + rel;
            let rest = &text[idx + prefix.len()..];
            let digit_len = rest
                .chars()
                .take_while(|ch| ch.is_ascii_digit())
                .map(|ch| ch.len_utf8())
                .sum::<usize>();
            if digit_len == 0 {
                start = idx + prefix.len();
                continue;
            }
            tables.insert(format!("{}{}", prefix, &rest[..digit_len]));
            start = idx + prefix.len() + digit_len;
        }
    }

    tables.into_iter().collect()
}

fn extract_rows_for_table(text: &str, table: &str) -> Vec<Value> {
    let mut rows = Vec::new();
    let mut seen = BTreeSet::new();
    let mut start = 0usize;

    while let Some(rel) = text[start..].find(table) {
        let idx = start + rel;
        let chunk = &text[idx..idx.saturating_add(6000).min(text.len())];
        if let Some(row) = parse_message_chunk(chunk) {
            let dedupe_key = format!(
                "{}:{}:{}",
                row.get("sendTime").and_then(Value::as_i64).unwrap_or(0),
                row.get("msgType").and_then(Value::as_i64).unwrap_or(0),
                row.get("content")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .chars()
                    .take(80)
                    .collect::<String>()
            );
            if seen.insert(dedupe_key) {
                rows.push(row);
            }
        }
        start = idx + table.len();
    }

    rows
}

fn parse_message_chunk(chunk: &str) -> Option<Value> {
    let send_time = parse_send_time(chunk)?;
    let mut row = Map::new();
    row.insert("sendTime".to_string(), Value::from(send_time));

    if let Some(msg_type) = parse_msg_type(chunk) {
        row.insert("msgType".to_string(), Value::from(msg_type));
    }
    if let Some(content) = parse_content(chunk) {
        row.insert("content".to_string(), Value::String(content));
    }
    if let Some(send_uid) = parse_send_uid(chunk) {
        row.insert("sendUid".to_string(), Value::String(send_uid));
    }
    if let Some(msg_id) = parse_msg_id(chunk) {
        row.insert("MsgID".to_string(), Value::String(msg_id));
    }
    if let Some(custom_msg_id) = parse_custom_msg_id(chunk) {
        row.insert("customMsgId".to_string(), Value::String(custom_msg_id));
    }

    Some(Value::Object(row))
}

fn parse_send_time(chunk: &str) -> Option<i64> {
    for marker in ["sendTime\"\r", "sendTime\"", "sendTime"] {
        if let Some(value) = parse_digits_after(chunk, marker) {
            return Some(value);
        }
    }
    None
}

fn parse_msg_type(chunk: &str) -> Option<i32> {
    let marker = "msgTypeI";
    let idx = chunk.find(marker)?;
    let byte = *chunk.as_bytes().get(idx + marker.len())?;
    Some(i32::from(byte))
}

fn parse_content(chunk: &str) -> Option<String> {
    let marker = "content\"";
    let idx = chunk.find(marker)?;
    let mut rest = &chunk[idx + marker.len()..];
    while let Some(first) = rest.chars().next() {
        if first.is_ascii_graphic() || first == ' ' {
            break;
        }
        rest = &rest[first.len_utf8()..];
    }

    let mut end = 0usize;
    for (i, ch) in rest.char_indices() {
        if ch == '"' && i > 0 {
            break;
        }
        end = i + ch.len_utf8();
        if end >= 4000 {
            break;
        }
    }
    if end == 0 {
        return None;
    }

    let content = rest[..end].to_string();
    if content.trim().is_empty() {
        None
    } else {
        Some(content)
    }
}

fn parse_send_uid(chunk: &str) -> Option<String> {
    if let Some(value) = parse_number_field(chunk, "sendUidN") {
        return Some(value);
    }
    parse_quoted_field(chunk, "sendUid\"")
}

fn parse_msg_id(chunk: &str) -> Option<String> {
    if let Some(value) = parse_number_field(chunk, "msgIdN") {
        return Some(value);
    }
    if let Some(value) = parse_number_field(chunk, "MsgIDN") {
        return Some(value);
    }
    parse_quoted_field(chunk, "msgId\"")
}

fn parse_custom_msg_id(chunk: &str) -> Option<String> {
    parse_quoted_field(chunk, "customMsgId\"")
}

fn parse_number_field(chunk: &str, marker: &str) -> Option<String> {
    let idx = chunk.find(marker)?;
    let bytes = chunk.as_bytes();
    let start = idx + marker.len();
    if start + 8 > bytes.len() {
        return None;
    }
    let mut arr = [0u8; 8];
    arr.copy_from_slice(&bytes[start..start + 8]);
    let value = f64::from_le_bytes(arr);
    if !value.is_finite() || value <= 0.0 {
        return None;
    }
    Some(format!("{}", value.round() as i64))
}

fn parse_quoted_field(chunk: &str, marker: &str) -> Option<String> {
    let idx = chunk.find(marker)?;
    let rest = &chunk[idx + marker.len()..];
    let digit_len = rest
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .map(|ch| ch.len_utf8())
        .sum::<usize>();
    if digit_len == 0 {
        return None;
    }
    Some(rest[..digit_len].to_string())
}

fn parse_digits_after(text: &str, marker: &str) -> Option<i64> {
    let idx = text.find(marker)?;
    let rest = &text[idx + marker.len()..];
    let digit_len = rest
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .map(|ch| ch.len_utf8())
        .sum::<usize>();
    if digit_len == 0 {
        return None;
    }
    rest[..digit_len].parse().ok()
}

pub fn import_history_from_user_data(
    user_data: &Path,
    uid: &str,
) -> (Map<String, Value>, usize) {
    let history = extract_history_from_user_data(user_data, uid);
    let table_count = history.len();
    let row_count = history
        .values()
        .filter_map(Value::as_array)
        .map(|rows| rows.len())
        .sum();
    if table_count > 0 {
        info!(
            "[legacy-indexeddb] extracted uid={} from {:?}: tables={} rows={}",
            uid, user_data, table_count, row_count
        );
    }
    (history, row_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_legacy_tables_from_sample_blob() {
        let sample = "894508-message.man634037\"sendTime\"\r1781593843158\"msgTypeI\x00\"content\"hi\"";
        let tables = find_legacy_tables(sample, "894508");
        assert!(tables.contains(&"894508-message.man634037".to_string()));
    }

    #[test]
    fn parse_message_chunk_reads_send_time_and_type() {
        let chunk = "894508-message.man634037\"sendTime\"\r1781593843158\"msgTypeI\x02\"content\"\x02hi\"";
        let row = parse_message_chunk(chunk).expect("row");
        assert_eq!(row.get("sendTime").and_then(Value::as_i64), Some(1781593843158));
        assert_eq!(row.get("msgType").and_then(Value::as_i64), Some(2));
        assert_eq!(row.get("content").and_then(Value::as_str), Some("hi"));
    }

    #[test]
    fn legacy_user_data_path_uses_brand_im_suffix() {
        let paths = legacy_electron_user_data_paths("55");
        assert!(!paths.is_empty());
        assert!(paths[0].to_string_lossy().ends_with("55-im"));
    }
}
