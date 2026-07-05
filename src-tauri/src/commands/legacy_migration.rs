use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, State};
use tracing::{info, warn};

use crate::branding::{self, app_brand_id};
use crate::commands::account_transfer;
use crate::crypto::aes;
use crate::db::DbManager;

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

    if is_uid_already_migrated(&app_data_dir, uid.as_str())? {
        return Ok(LegacyMigrationResult {
            attempted: false,
            migrated: false,
            skipped: true,
            reason: "already migrated".to_string(),
            imported_count: 0,
        });
    }

    db.get_or_create(&uid).map_err(|e| e.to_string())?;

    let existing_messages = db
        .with_connection(&uid, count_messages)
        .map_err(|e| e.to_string())?;
    if existing_messages > 0 {
        mark_uid_migrated(
            &app_data_dir,
            &uid,
            LegacyMigrationRecord {
                uid: uid.clone(),
                migrated_at: chrono::Utc::now().timestamp_millis(),
                source: "existing_sqlite".to_string(),
                imported_count: existing_messages,
            },
        )?;
        return Ok(LegacyMigrationResult {
            attempted: false,
            migrated: false,
            skipped: true,
            reason: "sqlite already has messages".to_string(),
            imported_count: 0,
        });
    }

    let cache_key = branding::legacy_history_cache_key(brand_id);
    let cache_path = legacy_temp_cache_file(&uid, brand_id);

    if !cache_path.is_file() {
        info!(
            "[legacy-migration] no legacy cache uid={} brand={} legacy_user_data={} path={:?}",
            uid,
            brand_id,
            branding::legacy_electron_user_data_name(brand_id),
            cache_path
        );
        return Ok(LegacyMigrationResult {
            attempted: true,
            migrated: false,
            skipped: true,
            reason: "legacy cache not found".to_string(),
            imported_count: 0,
        });
    }

    let encrypted = std::fs::read(&cache_path).map_err(|e| {
        format!(
            "failed to read legacy cache {:?}: {}",
            cache_path, e
        )
    })?;

    let decrypted = aes::decrypt_message(&encrypted, cache_key).map_err(|e| {
        format!(
            "failed to decrypt legacy cache uid={} brand={}: {}",
            uid, brand_id, e
        )
    })?;

    let payload: Value = serde_json::from_slice(&decrypted).map_err(|e| {
        format!(
            "failed to parse legacy cache uid={} brand={}: {}",
            uid, brand_id, e
        )
    })?;

    let (payload_uid, history_obj) = normalize_legacy_history_payload(&payload)?;
    if payload_uid != uid {
        warn!(
            "[legacy-migration] cache uid mismatch expected={} actual={} brand={}",
            uid, payload_uid, brand_id
        );
        return Ok(LegacyMigrationResult {
            attempted: true,
            migrated: false,
            skipped: true,
            reason: "legacy cache uid mismatch".to_string(),
            imported_count: 0,
        });
    }

    if history_obj.is_empty() {
        return Ok(LegacyMigrationResult {
            attempted: true,
            migrated: false,
            skipped: true,
            reason: "legacy cache history is empty".to_string(),
            imported_count: 0,
        });
    }

    let imported_count = db
        .with_connection(&uid, |conn| account_transfer::import_history_value(conn, &uid, &history_obj))
        .map_err(|e| e.to_string())?;

    mark_uid_migrated(
        &app_data_dir,
        &uid,
        LegacyMigrationRecord {
            uid: uid.clone(),
            migrated_at: chrono::Utc::now().timestamp_millis(),
            source: format!("temp_cache:{brand_id}"),
            imported_count,
        },
    )?;

    info!(
        "[legacy-migration] imported uid={} brand={} count={} from {:?}",
        uid, brand_id, imported_count, cache_path
    );

    Ok(LegacyMigrationResult {
        attempted: true,
        migrated: true,
        skipped: false,
        reason: "imported from legacy temp cache".to_string(),
        imported_count,
    })
}

fn count_messages(conn: &Connection) -> Result<usize, crate::db::DbError> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM messages", [], |row| row.get(0))
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
    Ok(count.max(0) as usize)
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
    Ok(store.records.contains_key(uid))
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
