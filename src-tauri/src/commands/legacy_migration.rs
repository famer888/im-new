use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, State};
use tracing::{info, warn};

use crate::branding::{self, app_brand_id};
use crate::commands::legacy_indexeddb;
use crate::commands::account_transfer;
use crate::crypto::aes;
use crate::db::DbManager;

static LEGACY_MIGRATION_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone)]
struct LegacyCacheCandidate {
    path: PathBuf,
    cache_key: &'static str,
    source: &'static str,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct LegacyMigrationStore {
    #[serde(default)]
    records: HashMap<String, LegacyMigrationRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyMigrationRecord {
    uid: String,
    migrated_at: i64,
    source: String,
    imported_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyMigrationResult {
    pub attempted: bool,
    pub migrated: bool,
    pub skipped: bool,
    pub reason: String,
    pub imported_count: usize,
}

#[tauri::command]
pub async fn try_migrate_legacy_desktop_data(
    app: AppHandle,
    db: State<'_, DbManager>,
    uid: String,
) -> Result<LegacyMigrationResult, String> {
    migrate_legacy_desktop_data_for_uid(&app, &db, uid.trim())
}

pub fn migrate_legacy_desktop_data_for_uid(
    app: &AppHandle,
    db: &DbManager,
    uid: &str,
) -> Result<LegacyMigrationResult, String> {
    let _guard = LEGACY_MIGRATION_LOCK
        .lock()
        .map_err(|_| "legacy migration lock poisoned".to_string())?;

    let uid = uid.trim().to_string();
    if uid.is_empty() {
        return Ok(LegacyMigrationResult {
            attempted: false,
            migrated: false,
            skipped: true,
            reason: "uid is empty".to_string(),
            imported_count: 0,
        });
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        return Ok(LegacyMigrationResult {
            attempted: false,
            migrated: false,
            skipped: true,
            reason: "legacy migration is desktop-only".to_string(),
            imported_count: 0,
        });
    }

    let brand_id = app_brand_id(app);
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    if should_skip_migration(&app_data_dir, db, &uid)? {
        return Ok(LegacyMigrationResult {
            attempted: false,
            migrated: false,
            skipped: true,
            reason: "already migrated".to_string(),
            imported_count: 0,
        });
    }

    db.get_or_create(&uid).map_err(|e| e.to_string())?;

    let candidates = legacy_cache_candidates(&uid, brand_id);
    let tried_paths = candidates
        .iter()
        .map(|item| format!("{}:{:?}", item.source, item.path))
        .collect::<Vec<_>>()
        .join(", ");
    let mut last_reason = "legacy cache not found".to_string();
    for candidate in candidates {
        let Some((payload_uid, history_obj)) = read_legacy_history_from_cache(&candidate)? else {
            continue;
        };

        if payload_uid != uid {
            warn!(
                "[legacy-migration] cache uid mismatch expected={} actual={} source={} path={:?}",
                uid, payload_uid, candidate.source, candidate.path
            );
            last_reason = "legacy cache uid mismatch".to_string();
            continue;
        }

        if history_obj.is_empty() {
            last_reason = "legacy cache history is empty".to_string();
            continue;
        }

        let imported_count = db
            .with_connection(&uid, |conn| {
                account_transfer::import_history_value(conn, &uid, &history_obj)
            })
            .map_err(|e| e.to_string())?;

        mark_uid_migrated(
            &app_data_dir,
            &uid,
            LegacyMigrationRecord {
                uid: uid.clone(),
                migrated_at: chrono::Utc::now().timestamp_millis(),
                source: format!("temp_cache:{}:{}", brand_id, candidate.source),
                imported_count,
            },
        )?;

        info!(
            "[legacy-migration] imported uid={} brand={} count={} source={} from {:?}",
            uid, brand_id, imported_count, candidate.source, candidate.path
        );

        return Ok(LegacyMigrationResult {
            attempted: true,
            migrated: true,
            skipped: false,
            reason: format!("imported from legacy temp cache ({})", candidate.source),
            imported_count,
        });
    }

    info!(
        "[legacy-migration] no legacy cache uid={} brand={} legacy_user_data={} tried={}",
        uid,
        brand_id,
        branding::legacy_electron_user_data_name(brand_id),
        tried_paths
    );

    for user_data_path in legacy_indexeddb::legacy_electron_user_data_paths(brand_id) {
        let (history_obj, row_count) =
            legacy_indexeddb::import_history_from_user_data(&user_data_path, &uid);
        if history_obj.is_empty() || row_count == 0 {
            continue;
        }

        let imported_count = db
            .with_connection(&uid, |conn| {
                account_transfer::import_history_value(conn, &uid, &history_obj)
            })
            .map_err(|e| e.to_string())?;

        mark_uid_migrated(
            &app_data_dir,
            &uid,
            LegacyMigrationRecord {
                uid: uid.clone(),
                migrated_at: chrono::Utc::now().timestamp_millis(),
                source: format!(
                    "indexeddb:{}:{}",
                    brand_id,
                    user_data_path.to_string_lossy()
                ),
                imported_count,
            },
        )?;

        info!(
            "[legacy-migration] imported uid={} brand={} count={} from indexeddb {:?}",
            uid, brand_id, imported_count, user_data_path
        );

        return Ok(LegacyMigrationResult {
            attempted: true,
            migrated: true,
            skipped: false,
            reason: "imported from legacy electron indexeddb".to_string(),
            imported_count,
        });
    }

    Ok(LegacyMigrationResult {
        attempted: true,
        migrated: false,
        skipped: true,
        reason: last_reason,
        imported_count: 0,
    })
}

fn legacy_cache_candidates(uid: &str, brand_id: &str) -> Vec<LegacyCacheCandidate> {
    let mut candidates = Vec::new();
    let mut seen_paths = HashMap::<String, ()>::new();

    let mut push_candidate = |storage_brand: &str, cache_key: &'static str, source: &'static str| {
        let path = legacy_temp_cache_file(uid, storage_brand);
        let path_key = path.to_string_lossy().to_string();
        if seen_paths.contains_key(&path_key) {
            return;
        }
        seen_paths.insert(path_key, ());
        candidates.push(LegacyCacheCandidate {
            path,
            cache_key,
            source,
        });
    };

    push_candidate(brand_id, branding::legacy_history_cache_key(brand_id), "brand");
    // 旧 Electron 工程 tools.js/cacheDB.js 固定写 97LocalStorage + 9754，45/55 包也走这里。
    if brand_id != "97" {
        push_candidate("97", "9754", "legacy97");
    }

    candidates
}

fn read_legacy_history_from_cache(
    candidate: &LegacyCacheCandidate,
) -> Result<Option<(String, Map<String, Value>)>, String> {
    if !candidate.path.is_file() {
        return Ok(None);
    }

    let encrypted = std::fs::read(&candidate.path).map_err(|e| {
        format!(
            "failed to read legacy cache {:?}: {}",
            candidate.path, e
        )
    })?;

    let decrypted = match aes::decrypt_message(&encrypted, candidate.cache_key) {
        Ok(value) => value,
        Err(err) => {
            warn!(
                "[legacy-migration] decrypt failed source={} path={:?}: {}",
                candidate.source, candidate.path, err
            );
            return Ok(None);
        }
    };

    let payload: Value = match serde_json::from_slice(&decrypted) {
        Ok(value) => value,
        Err(err) => {
            warn!(
                "[legacy-migration] parse failed source={} path={:?}: {}",
                candidate.source, candidate.path, err
            );
            return Ok(None);
        }
    };

    match normalize_legacy_history_payload(&payload) {
        Ok(result) => Ok(Some(result)),
        Err(err) => {
            warn!(
                "[legacy-migration] normalize failed source={} path={:?}: {}",
                candidate.source, candidate.path, err
            );
            Ok(None)
        }
    }
}

fn migration_store_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("legacy_migration.json")
}

fn read_migration_store(app_data_dir: &Path) -> Result<LegacyMigrationStore, String> {
    let path = migration_store_path(app_data_dir);
    if !path.is_file() {
        return Ok(LegacyMigrationStore::default());
    }

    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn write_migration_store(app_data_dir: &Path, store: &LegacyMigrationStore) -> Result<(), String> {
    let path = migration_store_path(app_data_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())
}

fn is_uid_already_migrated(app_data_dir: &Path, uid: &str) -> Result<bool, String> {
    let store = read_migration_store(app_data_dir)?;
    let Some(record) = store.records.get(uid) else {
        return Ok(false);
    };
    // 旧逻辑在频道消息先写入 SQLite 时会误标 migrated，允许重新导入单聊/群聊历史。
    if record.source == "existing_sqlite" {
        return Ok(false);
    }
    Ok(true)
}

fn should_skip_migration(
    app_data_dir: &Path,
    db: &DbManager,
    uid: &str,
) -> Result<bool, String> {
    if !is_uid_already_migrated(app_data_dir, uid)? {
        return Ok(false);
    }

    let friend_group_count = db
        .with_connection(uid, count_friend_group_messages)
        .map_err(|e| e.to_string())?;
    // 已迁移但单聊/群聊仍为空时，继续尝试旧 Electron IndexedDB 补导。
    Ok(friend_group_count > 0)
}

fn count_friend_group_messages(conn: &Connection) -> Result<usize, crate::db::DbError> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM messages
             WHERE conversation_id GLOB '0_*' OR conversation_id GLOB '1_*'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
    Ok(count.max(0) as usize)
}

fn mark_uid_migrated(
    app_data_dir: &Path,
    uid: &str,
    record: LegacyMigrationRecord,
) -> Result<(), String> {
    let mut store = read_migration_store(app_data_dir)?;
    store.records.insert(uid.to_string(), record);
    write_migration_store(app_data_dir, &store)
}

fn legacy_temp_cache_file(uid: &str, brand_id: &str) -> PathBuf {
    std::env::temp_dir()
        .join(branding::legacy_temp_storage_dir_name(brand_id))
        .join(format!("user-{uid}"))
        .join("abc")
}

fn normalize_legacy_history_payload(payload: &Value) -> Result<(String, Map<String, Value>), String> {
    let payload_obj = payload
        .as_object()
        .ok_or_else(|| "legacy payload must be an object".to_string())?;

    let uid = payload_obj
        .get("uid")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if uid.is_empty() {
        return Err("legacy payload uid is missing".to_string());
    }

    let history_value = payload_obj
        .get("history")
        .ok_or_else(|| "legacy payload history is missing".to_string())?;

    if let Some(history_obj) = history_value.as_object() {
        return Ok((uid, history_obj.clone()));
    }

    if let Some(items) = history_value.as_array() {
        let mut history_obj = Map::new();
        for item in items {
            let Some(item_obj) = item.as_object() else {
                continue;
            };
            let Some(name) = item_obj.get("name").and_then(Value::as_str) else {
                continue;
            };
            let Some(list) = item_obj.get("list") else {
                continue;
            };
            if name.trim().is_empty() {
                continue;
            }
            history_obj.insert(name.trim().to_string(), list.clone());
        }
        return Ok((uid, history_obj));
    }

    Err("legacy payload history has unsupported format".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn legacy_cache_candidates_include_legacy97_for_non_97_brand() {
        let candidates = legacy_cache_candidates("123", "45");
        assert_eq!(candidates.len(), 2);
        assert_eq!(candidates[0].source, "brand");
        assert_eq!(candidates[0].cache_key, "4554");
        assert_eq!(candidates[1].source, "legacy97");
        assert_eq!(candidates[1].cache_key, "9754");
        assert_eq!(
            candidates[1].path,
            std::env::temp_dir()
                .join("97LocalStorage")
                .join("user-123")
                .join("abc")
        );
    }

    #[test]
    fn legacy_cache_candidates_only_brand_for_97() {
        let candidates = legacy_cache_candidates("123", "97");
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].source, "brand");
        assert_eq!(candidates[0].cache_key, "9754");
    }

    #[test]
    fn normalize_array_history_payload() {
        let payload = json!({
            "uid": "10001",
            "history": [
                { "name": "10001-message.man200", "list": [{ "sendTime": 1 }] }
            ]
        });
        let (uid, history) = normalize_legacy_history_payload(&payload).unwrap();
        assert_eq!(uid, "10001");
        assert!(history.contains_key("10001-message.man200"));
    }

    #[test]
    fn normalize_object_history_payload() {
        let payload = json!({
            "uid": "10001",
            "history": {
                "10001-message.man200": [{ "sendTime": 1 }]
            }
        });
        let (uid, history) = normalize_legacy_history_payload(&payload).unwrap();
        assert_eq!(uid, "10001");
        assert!(history.contains_key("10001-message.man200"));
    }

    #[test]
    fn legacy_paths_are_brand_scoped() {
        assert_eq!(
            legacy_temp_cache_file("123", "45"),
            std::env::temp_dir()
                .join("45LocalStorage")
                .join("user-123")
                .join("abc")
        );
        assert_eq!(
            legacy_temp_cache_file("123", "97"),
            std::env::temp_dir()
                .join("97LocalStorage")
                .join("user-123")
                .join("abc")
        );
        assert_eq!(branding::legacy_history_cache_key("55"), "5554");
    }
}
