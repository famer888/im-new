use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Map, Value};
use tracing::{info, warn};

use crate::branding;

/// 旧 Electron 桌面端 userData 目录（覆盖安装后仍保留）。
pub fn legacy_electron_user_data_paths(brand_id: &str) -> Vec<PathBuf> {
    legacy_electron_user_data_paths_with_backup(brand_id, None)
}

/// 额外扫描安装器备份目录（`%APPDATA%\{identifier}\legacy-electron-backup\`）。
/// Win 覆盖安装会先卸旧 Electron；旧包 deleteAppDataOnUninstall 会清 userData，
/// 安装钩子会把 otc-pc-chat / {brand}-im 备份到这里。
pub fn legacy_electron_user_data_paths_with_backup(
    brand_id: &str,
    backup_root: Option<&Path>,
) -> Vec<PathBuf> {
    let brand_id = branding::normalize_brand_id(brand_id);
    let mut paths = Vec::new();
    let mut seen = BTreeSet::new();

    let mut push_dir = |path: PathBuf| {
        push_user_data_path(path, &mut paths, &mut seen);
    };

    // 安装器备份优先：卸载可能已清掉原 userData。
    if let Some(root) = backup_root {
        let brand_name = branding::legacy_electron_user_data_name(brand_id);
        for app_name in [
            "otc-pc-chat",
            brand_name.as_str(),
            "ocs-im",
            "ocs-im-dev",
            "ocs-im-new-test",
            "ocs-im-new-uat",
            "45-im",
            "68-im",
            "97-im",
        ] {
            push_dir(root.join(app_name));
        }
    }

    let mut push_app_name = |app_name: &str| {
        if let Some(path) = platform_user_data_path(app_name) {
            push_dir(path);
        }
    };

    // 旧 ocs 的 background.js 用 webpack 打进包里的源 package.json name 调用
    // `app.setName("otc-pc-chat")`，ready 之后 Chromium IndexedDB 实际落在这个目录，
    // 而不是 electron-builder 的 productName（55-im / ocs-im-new-test）。必须优先扫这里。
    push_app_name("otc-pc-chat");
    push_app_name(&branding::legacy_electron_user_data_name(brand_id));
    if brand_id != "97" {
        push_app_name(&branding::legacy_electron_user_data_name("97"));
    }
    // 老 Electron 包曾经使用过这些 userData 名称；覆盖安装后目录仍可能保留。
    for app_name in [
        "ocs-im",
        "ocs-im-dev",
        "ocs-im-new-test",
        "ocs-im-new-uat",
        "45-im",
        "68-im",
    ] {
        push_app_name(app_name);
    }

    paths
}

fn push_user_data_path(path: PathBuf, paths: &mut Vec<PathBuf>, seen: &mut BTreeSet<PathBuf>) {
    if !path.is_dir() {
        return;
    }
    if seen.insert(path.clone()) {
        paths.push(path.clone());
    }

    let Ok(entries) = fs::read_dir(&path) else {
        return;
    };
    for entry in entries.flatten() {
        let child = entry.path();
        let Some(name) = child.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        // 旧 Electron 多开会把真正的 userData 切到 DATA_* 子目录，历史库就在其 IndexedDB 下。
        if name.starts_with("DATA_")
            && child.join("IndexedDB").is_dir()
            && seen.insert(child.clone())
        {
            paths.push(child);
        }
    }
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
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        extract_history_from_user_data_inner(user_data, uid)
    }));
    match result {
        Ok(history) => history,
        Err(_) => {
            warn!(
                "[legacy-indexeddb] extract panicked uid={} path={:?}; skip indexeddb import",
                uid, user_data
            );
            Map::new()
        }
    }
}

fn extract_history_from_user_data_inner(user_data: &Path, uid: &str) -> Map<String, Value> {
    let indexeddb_dir = user_data.join("IndexedDB");
    if !indexeddb_dir.is_dir() {
        return Map::new();
    }

    let mut files = Vec::new();
    collect_idb_files(&indexeddb_dir, &mut files);
    // 小文件优先：大 blob 分片更容易 OOM，且信息密度低。
    files.sort_by(|a, b| {
        let sa = fs::metadata(a).map(|m| m.len()).unwrap_or(u64::MAX);
        let sb = fs::metadata(b).map(|m| m.len()).unwrap_or(u64::MAX);
        sa.cmp(&sb).then_with(|| a.cmp(b))
    });

    // 按文件分别抽取再合并：避免整库拼成超大字符串导致闪退，同时提高 content/sendTime 局部命中率。
    const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;
    const MAX_TOTAL_BYTES: usize = 24 * 1024 * 1024;
    let mut total_read = 0usize;
    let mut merged_rows: HashMap<String, Vec<Value>> = HashMap::new();
    let mut merged_seen: HashMap<String, BTreeSet<String>> = HashMap::new();

    for path in &files {
        let file_len = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        if file_len == 0 || file_len > MAX_FILE_BYTES {
            if file_len > MAX_FILE_BYTES {
                warn!(
                    "[legacy-indexeddb] skip oversized file {:?} ({} bytes)",
                    path, file_len
                );
            }
            continue;
        }
        if total_read.saturating_add(file_len as usize) > MAX_TOTAL_BYTES {
            warn!(
                "[legacy-indexeddb] total read cap reached ({} bytes), stop scanning more files",
                total_read
            );
            break;
        }
        let bytes = match fs::read(path) {
            Ok(bytes) => bytes,
            Err(err) => {
                warn!("[legacy-indexeddb] failed to read {:?}: {}", path, err);
                continue;
            }
        };
        total_read = total_read.saturating_add(bytes.len());
        let part = extract_history_from_blob(&bytes, uid);
        for (table, rows_value) in part {
            let Some(rows) = rows_value.as_array() else {
                continue;
            };
            for row in rows {
                push_deduped_row(&mut merged_rows, &mut merged_seen, &table, row.clone());
            }
        }
    }

    // 再扫一遍仅 .ldb 的拼接小包：表名 key 与本账号消息多在 ldb 内。
    // 不要把 .log 拼进来——同一 otc-pc-chat 配置里常夹带其它登录账号的 WAL，
    // 与 ldb 拼接后按字节距离认领会把别人的消息误挂到本账号会话。
    let mut compact = Vec::new();
    const MAX_COMPACT_BYTES: usize = 12 * 1024 * 1024;
    for path in &files {
        let is_ldb = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext == "ldb")
            .unwrap_or(false);
        if !is_ldb {
            continue;
        }
        let file_len = fs::metadata(path).map(|m| m.len()).unwrap_or(0) as usize;
        if file_len == 0 || compact.len().saturating_add(file_len) > MAX_COMPACT_BYTES {
            continue;
        }
        match fs::read(path) {
            Ok(bytes) => compact.extend_from_slice(&bytes),
            Err(_) => continue,
        }
    }
    if !compact.is_empty() {
        let part = extract_history_from_blob(&compact, uid);
        for (table, rows_value) in part {
            let Some(rows) = rows_value.as_array() else {
                continue;
            };
            for row in rows {
                push_deduped_row(&mut merged_rows, &mut merged_seen, &table, row.clone());
            }
        }
    }

    let mut history = Map::new();
    for (table, rows) in merged_rows {
        history.insert(table, Value::Array(rows));
    }
    history
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
        if is_indexeddb_data_file(&path) {
            out.push(path);
        }
    }
}

/// LevelDB 主库是 `.ldb`/`.log`；大字段还会落到 `*.indexeddb.blob/` 下的无扩展名分片。
fn is_indexeddb_data_file(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if name.is_empty() || name == "LOCK" || name == "CURRENT" || name.starts_with("MANIFEST") {
        return false;
    }
    if name == "LOG" || name.starts_with("LOG.") {
        return true;
    }
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("ldb") | Some("log") => true,
        Some(_) => false,
        // blob 分片通常没有扩展名（纯数字文件名）
        None => name.chars().all(|ch| ch.is_ascii_digit()) || name.len() <= 4,
    }
}

fn extract_history_from_blob(blob: &[u8], uid: &str) -> Map<String, Value> {
    let text = String::from_utf8_lossy(blob);
    let tables = find_legacy_tables(&text, uid);
    let markers = collect_timestamp_markers(&text);

    // LevelDB 拼出来的字节流里，表名 key 和消息 value 经常隔得很远。
    // 以 sendTime 为锚点，用二分找最近表名，避免 O(markers×occurrences) 卡死闪退。
    let mut table_rows: HashMap<String, Vec<Value>> = HashMap::new();
    let mut table_seen: HashMap<String, BTreeSet<String>> = HashMap::new();
    for table in &tables {
        table_rows.insert(table.clone(), Vec::new());
        table_seen.insert(table.clone(), BTreeSet::new());
    }

    // at -> (score, table, send_time)；score 越小越优先（距离 + 非 sendTime 惩罚）
    let mut claims: HashMap<usize, (usize, String, i64)> = HashMap::new();

    if !tables.is_empty() {
        let mut occurrences: Vec<(usize, &String)> = Vec::new();
        for table in &tables {
            let mut start = 0usize;
            while let Some(rel) = text[start..].find(table.as_str()) {
                let idx = start + rel;
                if is_exact_table_match(&text, idx, table) {
                    occurrences.push((idx, table));
                }
                start = idx + table.len();
                if occurrences.len() >= 20_000 {
                    break;
                }
            }
            if occurrences.len() >= 20_000 {
                break;
            }
        }
        occurrences.sort_by_key(|(pos, _)| *pos);

        const LOOK_BACK: usize = 65_536;
        const LOOK_FORWARD: usize = 262_144;
        for marker in &markers {
            let Some((score, table)) =
                nearest_table_occurrence(&occurrences, marker.offset, LOOK_BACK, LOOK_FORWARD)
            else {
                continue;
            };
            let score = score.saturating_add(if marker.is_send_time { 0 } else { 1 });
            let replace = match claims.get(&marker.offset) {
                Some((old_score, _, _)) => score < *old_score,
                None => true,
            };
            if replace {
                claims.insert(marker.offset, (score, table.to_string(), marker.send_time));
            }
        }

        // 认领与表名正向扫描合并去重；正向窗口截到下一张表，避免把邻接会话消息吃进当前表。
        let boundary_positions: Vec<usize> = occurrences.iter().map(|(pos, _)| *pos).collect();
        for table in &tables {
            for row in extract_rows_for_table(&text, table, &boundary_positions) {
                push_deduped_row(&mut table_rows, &mut table_seen, table, row);
            }
        }
    }

    // 无表名 key 的 .log / blob 里，消息对象常自带 tableName"（仅认本 uid，绝不 remap 其它账号）。
    // 显式 tableName 优先于距离启发式，可纠正误挂到邻接会话的情况。
    for marker in &markers {
        let Some(table) = find_self_table_name_near(&text, marker.offset, uid) else {
            continue;
        };
        claims.insert(marker.offset, (0usize, table, marker.send_time));
    }

    for (offset, (_score, table, _send_time)) in claims {
        let local_start = offset.saturating_sub(1500);
        let local = safe_str_window(&text, local_start, 6500);
        let Some(row) = parse_message_chunk(local) else {
            continue;
        };
        push_deduped_row(&mut table_rows, &mut table_seen, &table, row);
    }

    let mut history = Map::new();
    let mut all_tables: BTreeSet<String> = tables.into_iter().collect();
    all_tables.extend(table_rows.keys().cloned());
    for table in all_tables {
        let rows = table_rows.remove(&table).unwrap_or_default();
        history.insert(table, Value::Array(rows));
    }
    history
}

/// 消息结构化克隆里常见 `"tableName".{uid}-groupMessage.man123`（中间可能夹长度字节）。
fn find_self_table_name_near(text: &str, marker_offset: usize, uid: &str) -> Option<String> {
    let start = marker_offset.saturating_sub(1200);
    let window = safe_str_window(text, start, 3200);
    let mut search = 0usize;
    let marker = "tableName\"";
    let prefixes = [
        format!("{uid}-message.man"),
        format!("{uid}-groupMessage.man"),
        format!("{uid}-channelMessage.man"),
    ];
    while let Some(rel) = window[search..].find(marker) {
        let at = search + rel + marker.len();
        let rest = &window[at..];
        let mut skip = 0usize;
        // Dexie 字符串前可能有 1～3 个长度/类型字节
        while skip < 4 && skip < rest.len() {
            let Some(ch) = rest[skip..].chars().next() else {
                break;
            };
            if ch.is_ascii_digit() {
                break;
            }
            skip += ch.len_utf8();
        }
        let candidate = &rest[skip..];
        for prefix in &prefixes {
            if let Some(stripped) = candidate.strip_prefix(prefix.as_str()) {
                let digit_len = stripped
                    .chars()
                    .take_while(|ch| ch.is_ascii_digit())
                    .map(|ch| ch.len_utf8())
                    .sum::<usize>();
                if digit_len > 0 {
                    return Some(format!("{}{}", prefix, &stripped[..digit_len]));
                }
            }
        }
        search = at;
    }
    None
}

fn nearest_table_occurrence<'a>(
    occurrences: &[(usize, &'a String)],
    marker_offset: usize,
    look_back: usize,
    look_forward: usize,
) -> Option<(usize, &'a String)> {
    if occurrences.is_empty() {
        return None;
    }
    let idx = match occurrences.binary_search_by_key(&marker_offset, |(pos, _)| *pos) {
        Ok(i) => i,
        Err(i) => i,
    };
    let mut best: Option<(usize, &'a String)> = None;
    for &cand in [idx.saturating_sub(1), idx, idx.saturating_add(1)].iter() {
        let Some(&(table_pos, table)) = occurrences.get(cand) else {
            continue;
        };
        if marker_offset < table_pos.saturating_sub(look_back)
            || marker_offset >= table_pos.saturating_add(look_forward)
        {
            continue;
        }
        let dist = if marker_offset >= table_pos {
            marker_offset - table_pos
        } else {
            table_pos - marker_offset
        };
        if best.map(|(best_dist, _)| dist < best_dist).unwrap_or(true) {
            best = Some((dist, table));
        }
    }
    // 再往左右各扩几格，避免刚好夹在两个表名中间时选错。
    let lo = idx.saturating_sub(4);
    let hi = (idx + 4).min(occurrences.len().saturating_sub(1));
    for cand in lo..=hi {
        let Some(&(table_pos, table)) = occurrences.get(cand) else {
            continue;
        };
        if marker_offset < table_pos.saturating_sub(look_back)
            || marker_offset >= table_pos.saturating_add(look_forward)
        {
            continue;
        }
        let dist = if marker_offset >= table_pos {
            marker_offset - table_pos
        } else {
            table_pos - marker_offset
        };
        if best.map(|(best_dist, _)| dist < best_dist).unwrap_or(true) {
            best = Some((dist, table));
        }
    }
    best
}

#[derive(Debug, Clone, Copy)]
struct TimestampMarker {
    offset: usize,
    send_time: i64,
    is_send_time: bool,
}

fn collect_timestamp_markers(text: &str) -> Vec<TimestampMarker> {
    let mut markers = Vec::new();
    // 全库只扫 sendTime，避免裸 time" 在二进制里爆炸匹配导致卡死/OOM。
    const MAX_MARKERS: usize = 80_000;
    for (marker, is_send_time) in [("sendTime\"\r", true), ("sendTime\"", true)] {
        let mut search_from = 0usize;
        while let Some(rel) = text[search_from..].find(marker) {
            let at = search_from + rel;
            if let Some(send_time) = parse_digits_after(&text[at..], marker) {
                if (1_000_000_000_000..=9_999_999_999_999).contains(&send_time) {
                    markers.push(TimestampMarker {
                        offset: at,
                        send_time,
                        is_send_time,
                    });
                    if markers.len() >= MAX_MARKERS {
                        return markers;
                    }
                }
            }
            search_from = at + marker.len();
        }
    }
    markers
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

/// 按字节窗口截取时必须落在 UTF-8 字符边界，否则会 panic（登录后迁移旧 IndexedDB 时踩过）。
fn safe_str_window(text: &str, start: usize, max_len: usize) -> &str {
    let len = text.len();
    if start >= len {
        return "";
    }
    // offset 往回减时可能落在多字节汉字中间，必须先对齐起点。
    let mut start = start;
    while start < len && !text.is_char_boundary(start) {
        start += 1;
    }
    if start >= len {
        return "";
    }
    let mut end = start.saturating_add(max_len).min(len);
    while end > start && !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[start..end]
}

/// `table` 匹配后若后面仍是数字，说明撞到了更长表名（如 man63 ⊂ man634037），应跳过。
fn is_exact_table_match(text: &str, idx: usize, table: &str) -> bool {
    let after = idx + table.len();
    if after >= text.len() {
        return true;
    }
    !text[after..]
        .chars()
        .next()
        .map(|ch| ch.is_ascii_digit())
        .unwrap_or(false)
}

fn message_dedupe_key(row: &Value) -> String {
    format!(
        "{}:{}:{}",
        row.get("sendTime").and_then(Value::as_i64).unwrap_or(0),
        row.get("msgType").and_then(Value::as_i64).unwrap_or(0),
        row.get("content")
            .and_then(Value::as_str)
            .unwrap_or("")
            .chars()
            .take(80)
            .collect::<String>()
    )
}

fn push_deduped_row(
    table_rows: &mut HashMap<String, Vec<Value>>,
    table_seen: &mut HashMap<String, BTreeSet<String>>,
    table: &str,
    row: Value,
) {
    let key = message_dedupe_key(&row);
    let seen = table_seen.entry(table.to_string()).or_default();
    if seen.insert(key) {
        table_rows.entry(table.to_string()).or_default().push(row);
    }
}

fn extract_rows_for_table(text: &str, table: &str, all_table_positions: &[usize]) -> Vec<Value> {
    let mut rows = Vec::new();
    let mut seen = BTreeSet::new();
    let mut start = 0usize;

    while let Some(rel) = text[start..].find(table) {
        let idx = start + rel;
        if !is_exact_table_match(text, idx, table) {
            start = idx + table.len();
            continue;
        }

        // 截到下一张表名，最多再看 8KB，避免 64KB 窗口把邻接会话消息误吸入。
        let next_table = all_table_positions
            .iter()
            .copied()
            .find(|&pos| pos > idx)
            .unwrap_or(text.len());
        let max_end = idx.saturating_add(8192).min(text.len());
        let end = next_table.min(max_end).max(idx);
        let chunk = safe_str_window(text, idx, end.saturating_sub(idx));
        for row in extract_messages_from_chunk(chunk) {
            if seen.insert(message_dedupe_key(&row)) {
                rows.push(row);
            }
        }
        start = idx + table.len();
    }

    rows
}

fn extract_messages_from_chunk(chunk: &str) -> Vec<Value> {
    let mut rows = Vec::new();
    let mut offsets = BTreeSet::new();

    for marker in ["sendTime\"\r", "sendTime\"", "time\"\r", "time\""] {
        let mut search_from = 0usize;
        while let Some(rel) = chunk[search_from..].find(marker) {
            let at = search_from + rel;
            if let Some(send_time) = parse_digits_after(&chunk[at..], marker) {
                if (1_000_000_000_000..=9_999_999_999_999).contains(&send_time) {
                    offsets.insert(at);
                }
            }
            search_from = at + marker.len();
        }
    }

    if offsets.is_empty() {
        if let Some(row) = parse_message_chunk(chunk) {
            rows.push(row);
        }
        return rows;
    }

    let positions: Vec<usize> = offsets.into_iter().collect();
    for (i, &pos) in positions.iter().enumerate() {
        let next = positions
            .get(i + 1)
            .copied()
            .unwrap_or_else(|| chunk.len().min(pos.saturating_add(4000)));
        let local_start = pos.saturating_sub(200);
        let local = safe_str_window(chunk, local_start, next.saturating_sub(local_start).max(1200));
        if let Some(row) = parse_message_chunk(local) {
            rows.push(row);
        }
    }
    rows
}

fn parse_message_chunk(chunk: &str) -> Option<Value> {
    let send_time = parse_send_time(chunk)?;
    let content = parse_content(chunk)?;
    // 没有正文的记录不要入库，否则聊天气泡会空着只剩时间。
    if content.trim().is_empty() {
        return None;
    }

    let mut row = Map::new();
    row.insert("sendTime".to_string(), Value::from(send_time));
    row.insert("content".to_string(), Value::String(content));

    if let Some(msg_type) = parse_msg_type(chunk) {
        row.insert("msgType".to_string(), Value::from(msg_type));
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
    for marker in [
        "sendTime\"\r",
        "sendTime\"",
        "sendTime",
        "time\"\r",
        "time\"",
    ] {
        if let Some(value) = parse_digits_after(chunk, marker) {
            if (1_000_000_000_000..=9_999_999_999_999).contains(&value) {
                return Some(value);
            }
        }
    }
    if let Some(value) = parse_number_field(chunk, "sendTimeN") {
        if let Ok(n) = value.parse::<i64>() {
            if (1_000_000_000_000..=9_999_999_999_999).contains(&n) {
                return Some(n);
            }
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
    parse_content_bytes(chunk.as_bytes())
}

fn parse_content_bytes(chunk: &[u8]) -> Option<String> {
    let mut best: Option<String> = None;
    for marker in [b"content\"\r".as_slice(), b"content\"".as_slice(), b"Content\"".as_slice()] {
        let mut search = 0usize;
        while let Some(rel) = find_bytes(&chunk[search..], marker) {
            let start = search + rel + marker.len();
            if let Some(content) = extract_content_at(chunk, start) {
                if best
                    .as_ref()
                    .map(|old| content.chars().count() > old.chars().count())
                    .unwrap_or(true)
                {
                    best = Some(content);
                }
            }
            search = start;
            if search >= chunk.len() {
                break;
            }
        }
    }
    best
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|window| window == needle)
}

fn read_leb128(bytes: &[u8]) -> Option<(usize, usize)> {
    let mut value = 0u64;
    let mut shift = 0u32;
    for (i, &b) in bytes.iter().enumerate().take(5) {
        value |= u64::from(b & 0x7f) << shift;
        if b & 0x80 == 0 {
            return usize::try_from(value).ok().map(|v| (v, i + 1));
        }
        shift += 7;
    }
    None
}

fn extract_content_at(chunk: &[u8], start: usize) -> Option<String> {
    if start >= chunk.len() {
        return None;
    }

    // Dexie/IndexedDB 常见：content" + LEB128 长度 + UTF-8 正文
    if let Some((len, header)) = read_leb128(&chunk[start..]) {
        if (1..=8000).contains(&len) {
            let body_start = start + header;
            let body_end = body_start.saturating_add(len);
            if body_end <= chunk.len() {
                if let Ok(text) = std::str::from_utf8(&chunk[body_start..body_end]) {
                    let trimmed = text.trim_end_matches('\0').trim();
                    if is_plausible_message_content(trimmed) {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    // 回退：跳过控制字节后截到下一个结构字段
    let mut i = start;
    while i < chunk.len() && chunk[i] < 0x20 {
        i += 1;
    }
    if i >= chunk.len() {
        return None;
    }
    let mut end = i;
    let limit = (i + 8000).min(chunk.len());
    while end < limit {
        if chunk[end] == b'"' {
            break;
        }
        if end + 8 <= chunk.len()
            && (chunk[end..end + 8] == *b"msgTypeI"
                || chunk[end..end + 8] == *b"\"msgType"
                || chunk[end..end + 8] == *b"sendTime"
                || (end + 9 <= chunk.len() && chunk[end..end + 9] == *b"\"sendUid\"")
                || (end + 9 <= chunk.len() && chunk[end..end + 9] == *b"\"fileKey\""))
        {
            break;
        }
        end += 1;
    }
    if end <= i {
        return None;
    }
    let text = String::from_utf8_lossy(&chunk[i..end]);
    let trimmed = text.replace('\u{FFFD}', "").trim_end_matches('\0').trim().to_string();
    if is_plausible_message_content(&trimmed) {
        Some(trimmed)
    } else {
        None
    }
}

fn is_plausible_message_content(content: &str) -> bool {
    let trimmed = content.trim();
    if trimmed.is_empty() || trimmed.len() > 8000 {
        return false;
    }
    // 误把后续字段拼进来时直接丢弃
    for bad in [
        "sendTime\"",
        "msgTypeI",
        "\"sendUid",
        "\"fileKey",
        "\"MsgID",
        "\"customMsgId",
        "\"chatType",
    ] {
        if trimmed.contains(bad) {
            return false;
        }
    }

    let looks_url = trimmed.contains("://") || trimmed.starts_with("http");
    let has_letter_or_cjk = trimmed.chars().any(|ch| {
        ch.is_ascii_alphabetic()
            || ('\u{4e00}'..='\u{9fff}').contains(&ch)
            || ('\u{3400}'..='\u{4dbf}').contains(&ch)
    });
    let digits_only = trimmed
        .chars()
        .all(|ch| ch.is_ascii_digit() || ch.is_whitespace());
    if !(looks_url || has_letter_or_cjk || digits_only) {
        return false;
    }

    let controlish = trimmed
        .chars()
        .filter(|ch| ch.is_control() || *ch == '\u{FFFD}')
        .count();
    controlish * 4 <= trimmed.chars().count()
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

pub fn import_history_from_user_data(user_data: &Path, uid: &str) -> (Map<String, Value>, usize) {
    let history = extract_history_from_user_data(user_data, uid);
    let table_count = history.len();
    let row_count = history
        .values()
        .filter_map(Value::as_array)
        .map(|rows| rows.len())
        .sum();
    // 有表名但行数为 0 时也算有效：至少能补出会话窗口。
    let import_score = if row_count > 0 {
        row_count
    } else {
        table_count
    };
    if table_count > 0 {
        info!(
            "[legacy-indexeddb] extracted uid={} from {:?}: tables={} rows={}",
            uid, user_data, table_count, row_count
        );
    }
    (history, import_score)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_legacy_tables_from_sample_blob() {
        let sample =
            "894508-message.man634037\"sendTime\"\r1781593843158\"msgTypeI\x00\"content\"hi\"";
        let tables = find_legacy_tables(sample, "894508");
        assert!(tables.contains(&"894508-message.man634037".to_string()));
    }

    #[test]
    fn parse_message_chunk_rejects_empty_content() {
        let chunk = "sendTime\"\r1781593843158\"msgTypeI\x00\"sendUid\"100";
        assert!(parse_message_chunk(chunk).is_none());
    }

    #[test]
    fn parse_message_chunk_reads_send_time_and_type() {
        let chunk =
            "894508-message.man634037\"sendTime\"\r1781593843158\"msgTypeI\x02\"content\"\x02hi\"";
        let row = parse_message_chunk(chunk).expect("row");
        assert_eq!(
            row.get("sendTime").and_then(Value::as_i64),
            Some(1781593843158)
        );
        assert_eq!(row.get("msgType").and_then(Value::as_i64), Some(2));
        assert_eq!(row.get("content").and_then(Value::as_str), Some("hi"));
    }

    #[test]
    fn extract_rows_ignores_shorter_table_prefix_match() {
        // man63 不能吃到 man634037 那一段；后者才带真实 sendTime。
        let text = concat!(
            "894508-message.man634037\"sendTime\"\r1781593843158\"msgTypeI\x02\"content\"hello\"",
            "xxxx894508-message.man63\"sendTime\"\r1781593843999\"msgTypeI\x01\"content\"short\""
        );
        let boundaries = [
            text.find("894508-message.man634037").unwrap(),
            text.find("894508-message.man63").unwrap(),
        ];
        let short_rows = extract_rows_for_table(text, "894508-message.man63", &boundaries);
        let long_rows = extract_rows_for_table(text, "894508-message.man634037", &boundaries);
        assert_eq!(short_rows.len(), 1);
        assert_eq!(
            short_rows[0].get("sendTime").and_then(Value::as_i64),
            Some(1781593843999)
        );
        assert_eq!(long_rows.len(), 1);
        assert_eq!(
            long_rows[0].get("sendTime").and_then(Value::as_i64),
            Some(1781593843158)
        );
    }

    #[test]
    fn extract_history_claims_via_self_table_name_without_key() {
        // .log 里往往没有 Dexie 表名 key，但消息自带 tableName。
        let blob = concat!(
            "xxxxx\"tableName\".894508-groupMessage.man28175\"Status\".",
            "\"sendTime\"\r1781593843158\"msgTypeI\x02\"content\"from-log\""
        );
        let history = extract_history_from_blob(blob.as_bytes(), "894508");
        let rows = history
            .get("894508-groupMessage.man28175")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        assert!(
            rows.iter().any(|row| {
                row.get("sendTime").and_then(Value::as_i64) == Some(1781593843158)
                    && row.get("content").and_then(Value::as_str) == Some("from-log")
            }),
            "expected self tableName claim, got {rows:?}"
        );
    }

    #[test]
    fn extract_history_ignores_other_uid_table_name() {
        let blob = concat!(
            "\"tableName\".886064-groupMessage.man26019\"Status\".",
            "\"sendTime\"\r1781593843158\"msgTypeI\x02\"content\"other-user\""
        );
        let history = extract_history_from_blob(blob.as_bytes(), "894508");
        assert!(
            history.values().all(|v| v.as_array().map(|a| a.is_empty()).unwrap_or(true)),
            "must not remap other uid tables: {history:?}"
        );
    }

    #[test]
    fn parse_content_keeps_chinese_text() {
        // LEB128 长度前缀 + UTF-8 中文（12 字节 = 4 个汉字）
        let chunk = "sendTime\"\r1781593843158\"msgTypeI\x00\"content\"\u{0c}中文你好\"sendUid\"100";
        let row = parse_message_chunk(chunk).expect("row");
        assert_eq!(
            row.get("content").and_then(Value::as_str),
            Some("中文你好")
        );
    }

    #[test]
    fn parse_content_keeps_url_after_length_prefix() {
        let url = "https://cdn.example/a.png";
        let chunk = format!(
            "sendTime\"\r1781593843158\"msgTypeI\x01\"content\"{}{}\"fileKey\"k",
            char::from_u32(url.len() as u32).unwrap(),
            url
        );
        let row = parse_message_chunk(&chunk).expect("row");
        assert_eq!(row.get("content").and_then(Value::as_str), Some(url));
        assert_eq!(row.get("msgType").and_then(Value::as_i64), Some(1));
    }

    #[test]
    fn parse_content_rejects_polluted_fields() {
        let chunk = "sendTime\"\r1781593843158\"content\"||388\"sendTime\"\r1781860245136\"msgTypeI\x00";
        assert!(parse_message_chunk(chunk).is_none());
    }

    #[test]
    fn safe_str_window_mid_multibyte_does_not_panic() {
        // 「你」是 3 字节；从字节 1 起截取绝不能 panic。
        let text = "你好\"sendTime\"\r1781593843158\"content\"中文消息";
        let window = safe_str_window(text, 1, 64);
        assert!(!window.is_empty());
        let _ = parse_message_chunk(window);
    }

    #[test]
    fn extract_history_claims_messages_far_from_table_key() {
        // 表名和 sendTime 相隔很远时，旧的短窗口会漏；认领算法应仍能关联。
        let padding = "x".repeat(20000);
        let blob = format!(
            "894508-message.man9001{padding}\"sendTime\"\r1781593843158\"msgTypeI\x02\"content\"far-msg\""
        );
        let history = extract_history_from_blob(blob.as_bytes(), "894508");
        let rows = history
            .get("894508-message.man9001")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        assert!(
            rows.iter().any(|row| {
                row.get("sendTime").and_then(Value::as_i64) == Some(1781593843158)
            }),
            "expected far message to be claimed, got {rows:?}"
        );
    }

    #[test]
    fn extract_history_merges_claim_and_near_table_scan() {
        // 远距离认领 + 表名旁扫描应都能留下，且去重。
        let padding = "x".repeat(18000);
        let blob = format!(
            "894508-message.man9001\"sendTime\"\r1781593843001\"msgTypeI\x01\"content\"near\"{padding}\"sendTime\"\r1781593843158\"msgTypeI\x02\"content\"far\"894508-message.man9001\"sendTime\"\r1781593843001\"msgTypeI\x01\"content\"near\""
        );
        let history = extract_history_from_blob(blob.as_bytes(), "894508");
        let rows = history
            .get("894508-message.man9001")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let times: BTreeSet<i64> = rows
            .iter()
            .filter_map(|row| row.get("sendTime").and_then(Value::as_i64))
            .collect();
        assert!(times.contains(&1781593843001), "near msg missing: {rows:?}");
        assert!(times.contains(&1781593843158), "far msg missing: {rows:?}");
        assert_eq!(times.len(), 2, "duplicate near msg should be deduped: {rows:?}");
    }

    #[test]
    fn legacy_user_data_paths_prefer_otc_pc_chat() {
        let paths = legacy_electron_user_data_paths("55");
        let names: Vec<String> = paths
            .iter()
            .map(|path| {
                path.file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("")
                    .to_string()
            })
            .collect();

        if platform_user_data_path("otc-pc-chat")
            .map(|path| path.is_dir())
            .unwrap_or(false)
        {
            assert_eq!(names.first().map(String::as_str), Some("otc-pc-chat"));
        }
        if platform_user_data_path("55-im")
            .map(|path| path.is_dir())
            .unwrap_or(false)
        {
            assert!(names.iter().any(|name| name == "55-im"));
        }
    }

    #[test]
    fn user_data_path_includes_data_children() {
        let temp = std::env::temp_dir().join(format!(
            "legacy-indexeddb-test-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let base = temp.join("55-im");
        let data_child = base.join("DATA_1");
        fs::create_dir_all(data_child.join("IndexedDB")).expect("create data child");
        fs::create_dir_all(base.join("Cache")).expect("create unrelated child");

        let mut paths = Vec::new();
        let mut seen = BTreeSet::new();
        push_user_data_path(base.clone(), &mut paths, &mut seen);

        assert_eq!(paths, vec![base, data_child]);
        let _ = fs::remove_dir_all(temp);
    }
}
