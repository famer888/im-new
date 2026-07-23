//! 旧安装包（Electron）会话摘要迁移：恢复会话列表的“最后消息时间/置顶”与未读数。
//!
//! 背景：重构版的会话排序时间与未读数完全由本地已落库的消息派生。旧包迁移只导入
//! 消息体（且 IndexedDB 启发式可能不全），从不写入会话的最后消息时间与未读，导致：
//!   1. 消息没同步过来的会话没有时间 → 排序错乱（沉底）。
//!   2. 单聊/群聊/频道的未读红点全部为 0。
//!
//! 旧 Electron 端用 `electron-store`(conf v5) 把会话列表与未读缓存持久化在
//! `{userData}/storage/` 下（AES-256-CBC + PBKDF2 加密）：
//!   - `ocs-storage-{uid}MessageUserList.json`    → 单聊会话列表（含 sendTime/bfTop）
//!   - `ocs-storage-{uid}MessageGroupList.json`   → 群聊会话列表
//!   - `ocs-storage-{uid}MessageChannelList.json` → 频道会话列表
//!   - `ocs-storage-{uid}-unread.json`            → `{ unread: { "{id}{type}": {count,time} } }`
//!
//! 迁移时读取并解密这些缓存，把最后消息时间/置顶/未读回填到本地会话表，
//! 让排序与未读（单聊/群/频道统一）直接恢复。

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};
use serde_json::{Map, Value};
use tracing::{info, warn};

use crate::crypto::aes;
use crate::db::DbError;

use super::legacy_indexeddb;

/// electron-store(conf v5) 在旧包里固定使用的加密 key（见旧 ocs `cache/storage.js`）。
const ELECTRON_STORE_ENCRYPTION_KEY: &str = "ocs_storage_encryption_key_randomized";

#[derive(Debug, Default, Clone, Copy)]
pub struct LegacySummaryStats {
    /// 回填过“最后消息时间/置顶”的会话数。
    pub conversations_touched: usize,
    /// 回填过未读数的会话数。
    pub unread_applied: usize,
}

/// 收集旧 Electron userData 下所有可能的 `storage/` 目录（含安装器备份）。
pub fn legacy_storage_dirs(brand_id: &str, app_data_dir: &Path) -> Vec<PathBuf> {
    let backup_root = app_data_dir.join("legacy-electron-backup");
    legacy_indexeddb::legacy_electron_user_data_paths_with_backup(
        brand_id,
        Some(backup_root.as_path()),
    )
    .into_iter()
    .map(|root| root.join("storage"))
    .collect()
}

/// 判断给定 storage 目录集合里是否存在该 uid 的任一会话摘要/未读缓存文件。
pub fn has_summary_files(dirs: &[PathBuf], uid: &str) -> bool {
    let names = [
        format!("ocs-storage-{uid}MessageUserList.json"),
        format!("ocs-storage-{uid}MessageGroupList.json"),
        format!("ocs-storage-{uid}MessageChannelList.json"),
        format!("ocs-storage-{uid}-unread.json"),
    ];
    dirs.iter()
        .any(|dir| names.iter().any(|name| dir.join(name).is_file()))
}

/// 读取并解密单个 electron-store 文件，返回其顶层 `data` 字段。
fn read_store_data(storage_dir: &Path, table_name: &str) -> Option<Value> {
    let path = storage_dir.join(format!("ocs-storage-{table_name}.json"));
    let raw = std::fs::read(&path).ok()?;

    // 兼容未加密写入的历史版本：先按明文 JSON 尝试，再按 conf v5 加密解密。
    let json: Value = serde_json::from_slice::<Value>(&raw)
        .ok()
        .or_else(|| {
            let decrypted =
                aes::decrypt_electron_store(&raw, ELECTRON_STORE_ENCRYPTION_KEY).ok()?;
            serde_json::from_slice(&decrypted).ok()
        })?;

    json.get("data").cloned()
}

fn value_to_i64(v: Option<&Value>) -> Option<i64> {
    match v? {
        Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)),
        Value::String(s) => s.trim().parse::<i64>().ok(),
        _ => None,
    }
}

/// 把会话 id 统一成字符串（数字 id 与字符串 id 都兼容）。
fn value_to_target_id(v: Option<&Value>) -> Option<String> {
    match v? {
        Value::Number(n) => Some(n.to_string()),
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        _ => None,
    }
}

fn value_truthy(v: Option<&Value>) -> bool {
    match v {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_i64().map(|x| x != 0).unwrap_or(false),
        Some(Value::String(s)) => !s.is_empty() && s != "0" && s != "false",
        _ => false,
    }
}

#[derive(Default, Clone, Copy)]
struct ConvSummary {
    conv_type: i32,
    send_time: i64,
    is_pinned: bool,
}

/// 把某一类型会话列表（friend/group/channel）合并进累积表：时间取最大、置顶取或。
fn collect_chat_list(
    acc: &mut HashMap<String, (String, ConvSummary)>,
    data: &Value,
    conv_type: i32,
) {
    let Some(items) = data.as_array() else {
        return;
    };
    for item in items {
        let Some(obj) = item.as_object() else {
            continue;
        };
        let Some(target_id) = value_to_target_id(obj.get("id")) else {
            continue;
        };
        let conv_id = format!("{conv_type}_{target_id}");
        let send_time = value_to_i64(obj.get("sendTime")).unwrap_or(0);
        let is_pinned = value_truthy(obj.get("bfTop"));

        let entry = acc.entry(conv_id).or_insert_with(|| {
            (
                target_id.clone(),
                ConvSummary {
                    conv_type,
                    send_time: 0,
                    is_pinned: false,
                },
            )
        });
        entry.1.conv_type = conv_type;
        entry.1.send_time = entry.1.send_time.max(send_time);
        entry.1.is_pinned = entry.1.is_pinned || is_pinned;
    }
}

/// 解析未读缓存 key（形如 `9527friend` / `123group` / `abcchannel`）→ 会话 id。
fn parse_unread_key(key: &str) -> Option<String> {
    for (suffix, conv_type) in [("channel", 2), ("friend", 0), ("group", 1)] {
        if let Some(id) = key.strip_suffix(suffix) {
            let id = id.trim();
            if id.is_empty() {
                return None;
            }
            return Some(format!("{conv_type}_{id}"));
        }
    }
    None
}

/// 从未读缓存对象里累积每个会话的未读数（跨目录取最大）。
fn collect_unread(acc: &mut HashMap<String, i64>, data: &Value) {
    // 结构：{ unread: { "{id}{type}": { count, time } } } ；个别版本可能直接是 { "{id}{type}": {...} }。
    let unread_obj: &Map<String, Value> = match data.get("unread").and_then(Value::as_object) {
        Some(obj) => obj,
        None => match data.as_object() {
            Some(obj) => obj,
            None => return,
        },
    };

    for (key, entry) in unread_obj {
        let Some(conv_id) = parse_unread_key(key) else {
            continue;
        };
        let count = value_to_i64(entry.get("count"))
            .or_else(|| value_to_i64(Some(entry)))
            .unwrap_or(0);
        if count <= 0 {
            continue;
        }
        let slot = acc.entry(conv_id).or_insert(0);
        *slot = (*slot).max(count);
    }
}

/// 读取旧包会话列表与未读缓存，把“最后消息时间/置顶/未读”回填到本地会话表。
///
/// - 时间/置顶：`INSERT OR IGNORE` 建会话窗口后，用 MAX 合并（不覆盖更新的消息派生时间）。
///   这样即使消息还没同步过来，旧会话也能带着正确时间出现在列表里，排序不再错乱。
/// - 未读：仅对“已存在的会话”按旧缓存绝对值回填未读红点（对齐旧安装包当时的数字）。
pub fn apply(
    conn: &Connection,
    uid: &str,
    storage_dirs: &[PathBuf],
) -> Result<LegacySummaryStats, DbError> {
    let mut chat_acc: HashMap<String, (String, ConvSummary)> = HashMap::new();
    let mut unread_acc: HashMap<String, i64> = HashMap::new();

    for dir in storage_dirs {
        if !dir.is_dir() {
            continue;
        }
        if let Some(data) = read_store_data(dir, &format!("{uid}MessageUserList")) {
            collect_chat_list(&mut chat_acc, &data, 0);
        }
        if let Some(data) = read_store_data(dir, &format!("{uid}MessageGroupList")) {
            collect_chat_list(&mut chat_acc, &data, 1);
        }
        if let Some(data) = read_store_data(dir, &format!("{uid}MessageChannelList")) {
            collect_chat_list(&mut chat_acc, &data, 2);
        }
        if let Some(data) = read_store_data(dir, &format!("{uid}-unread")) {
            collect_unread(&mut unread_acc, &data);
        }
    }

    if chat_acc.is_empty() && unread_acc.is_empty() {
        return Ok(LegacySummaryStats::default());
    }

    let mut stats = LegacySummaryStats::default();

    for (conv_id, (target_id, summary)) in &chat_acc {
        if summary.send_time <= 0 && !summary.is_pinned {
            continue;
        }
        conn.execute(
            "INSERT OR IGNORE INTO conversations (id, type, target_id, updated_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![conv_id, summary.conv_type, target_id, summary.send_time.max(0)],
        )
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

        // 只上调时间、不下调；置顶取或。避免覆盖更新的消息派生时间。
        conn.execute(
            "UPDATE conversations
             SET last_msg_time = MAX(COALESCE(last_msg_time, 0), ?2),
                 updated_at    = MAX(COALESCE(updated_at, 0), ?2),
                 is_pinned     = MAX(is_pinned, ?3)
             WHERE id = ?1",
            params![conv_id, summary.send_time.max(0), summary.is_pinned as i32],
        )
        .map_err(|e| DbError::SqliteError(e.to_string()))?;
        stats.conversations_touched += 1;
    }

    for (conv_id, count) in &unread_acc {
        // 仅回填“已存在”的会话未读（由 chat list 或消息导入创建），避免生成无用伪会话。
        let updated = conn
            .execute(
                "UPDATE conversations SET unread_count = ?2 WHERE id = ?1",
                params![conv_id, *count],
            )
            .map_err(|e| DbError::SqliteError(e.to_string()))?;
        if updated > 0 {
            stats.unread_applied += 1;
        }
    }

    info!(
        "[legacy-migration] restored conversation summary uid={} conv_time_pin={} unread={}",
        uid, stats.conversations_touched, stats.unread_applied
    );

    Ok(stats)
}

/// 便捷入口：按品牌定位旧 storage 目录并应用会话摘要恢复（失败只记录、不阻断迁移）。
pub fn apply_for_brand(
    conn: &Connection,
    uid: &str,
    brand_id: &str,
    app_data_dir: &Path,
) -> LegacySummaryStats {
    let dirs = legacy_storage_dirs(brand_id, app_data_dir);
    match apply(conn, uid, &dirs) {
        Ok(stats) => stats,
        Err(err) => {
            warn!(
                "[legacy-migration] restore conversation summary failed uid={} brand={}: {}",
                uid, brand_id, err
            );
            LegacySummaryStats::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE conversations (
                id TEXT PRIMARY KEY,
                type INTEGER NOT NULL,
                target_id TEXT NOT NULL,
                last_msg_id TEXT,
                last_msg_time INTEGER,
                last_msg_digest TEXT,
                unread_count INTEGER NOT NULL DEFAULT 0,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                is_muted INTEGER NOT NULL DEFAULT 0,
                is_archived INTEGER NOT NULL DEFAULT 0,
                draft TEXT,
                updated_at INTEGER NOT NULL DEFAULT 0
            );",
        )
        .unwrap();
        conn
    }

    fn write_plain_store(dir: &Path, table: &str, data: Value) {
        let path = dir.join(format!("ocs-storage-{table}.json"));
        std::fs::write(path, serde_json::to_vec(&serde_json::json!({ "data": data })).unwrap())
            .unwrap();
    }

    #[test]
    fn parse_unread_key_maps_types() {
        assert_eq!(parse_unread_key("9527friend").as_deref(), Some("0_9527"));
        assert_eq!(parse_unread_key("123group").as_deref(), Some("1_123"));
        assert_eq!(parse_unread_key("abcchannel").as_deref(), Some("2_abc"));
        assert_eq!(parse_unread_key("friend"), None);
        assert_eq!(parse_unread_key("nope"), None);
    }

    #[test]
    fn apply_restores_time_pin_and_unread() {
        let tmp = std::env::temp_dir().join(format!(
            "legacy-summary-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let storage = tmp.join("storage");
        std::fs::create_dir_all(&storage).unwrap();

        write_plain_store(
            &storage,
            "1001MessageUserList",
            serde_json::json!([
                { "id": 9527, "type": "friend", "sendTime": 1700000000000i64, "bfTop": true },
                { "id": 8888, "type": "friend", "sendTime": 1600000000000i64 }
            ]),
        );
        write_plain_store(
            &storage,
            "1001MessageGroupList",
            serde_json::json!([{ "id": 555, "type": "group", "sendTime": 1650000000000i64 }]),
        );
        write_plain_store(
            &storage,
            "1001MessageChannelList",
            serde_json::json!([{ "id": "chA", "type": "channel", "sendTime": 1680000000000i64 }]),
        );
        write_plain_store(
            &storage,
            "1001-unread",
            serde_json::json!({
                "unread": {
                    "9527friend": { "count": 3, "time": 1700000000000i64 },
                    "555group": { "count": 5 },
                    "chAchannel": { "count": 1 },
                    // 对应会话不存在时不应报错，只是跳过
                    "77777friend": { "count": 9 }
                }
            }),
        );

        let conn = setup_conn();
        let stats = apply(&conn, "1001", &[storage.clone()]).unwrap();
        assert_eq!(stats.conversations_touched, 4);
        assert_eq!(stats.unread_applied, 3);

        let (t, pin, unread): (i64, i32, i64) = conn
            .query_row(
                "SELECT last_msg_time, is_pinned, unread_count FROM conversations WHERE id = '0_9527'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(t, 1700000000000);
        assert_eq!(pin, 1);
        assert_eq!(unread, 3);

        let group_unread: i64 = conn
            .query_row(
                "SELECT unread_count FROM conversations WHERE id = '1_555'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(group_unread, 5);

        let channel_time: i64 = conn
            .query_row(
                "SELECT last_msg_time FROM conversations WHERE id = '2_chA'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(channel_time, 1680000000000);

        // 不存在的会话不应被创建
        let missing: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM conversations WHERE id = '0_77777'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(missing, 0);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn apply_does_not_lower_existing_time() {
        let tmp = std::env::temp_dir().join(format!(
            "legacy-summary-test2-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let storage = tmp.join("storage");
        std::fs::create_dir_all(&storage).unwrap();
        write_plain_store(
            &storage,
            "1001MessageUserList",
            serde_json::json!([{ "id": 9527, "type": "friend", "sendTime": 1000i64 }]),
        );

        let conn = setup_conn();
        // 已有一条更新的消息派生时间，不应被旧缓存的更早时间下调。
        conn.execute(
            "INSERT INTO conversations (id, type, target_id, last_msg_time, updated_at)
             VALUES ('0_9527', 0, '9527', 5000, 5000)",
            [],
        )
        .unwrap();

        apply(&conn, "1001", &[storage.clone()]).unwrap();

        let t: i64 = conn
            .query_row(
                "SELECT last_msg_time FROM conversations WHERE id = '0_9527'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(t, 5000);

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
