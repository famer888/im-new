use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tracing::{info, warn};

use crate::branding::{self, app_brand_id};
use crate::commands::account_transfer;
use crate::commands::legacy_indexeddb;
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
    #[serde(default)]
    source_fingerprints: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyMigrationResult {
    pub attempted: bool,
    pub migrated: bool,
    pub skipped: bool,
    pub reason: String,
    pub imported_count: usize,
    /// 仅 temp_cache(abc) 导入视为完整；IndexedDB 启发式可能不全，前端应继续轮询。
    pub complete: bool,
}

/// IndexedDB 抽取算法版本；升级后允许对曾半导入账号再扫一次。
const INDEXEDDB_EXTRACTOR_VERSION: u32 = 7;

#[tauri::command]
pub async fn try_migrate_legacy_desktop_data(
    app: AppHandle,
    uid: String,
) -> Result<LegacyMigrationResult, String> {
    let uid = uid.trim().to_string();
    let app_for_job = app.clone();
    tokio::task::spawn_blocking(move || {
        let db = app_for_job.state::<DbManager>();
        migrate_legacy_desktop_data_for_uid(&app_for_job, db.inner(), &uid)
    })
    .await
    .map_err(|e| format!("legacy migration join error: {e}"))?
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
            complete: false,
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
            complete: false,
        });
    }

    let brand_id = app_brand_id(app);
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let candidates = legacy_cache_candidates(&uid, brand_id, &app_data_dir);

    // abc 完整导入后只在源文件未变时跳过。用户回到旧版继续收发消息后，
    // 下次启动重构版必须再做一次幂等增量导入。
    if has_unchanged_complete_temp_cache_migration(&app_data_dir, &uid, &candidates)? {
        return Ok(LegacyMigrationResult {
            attempted: false,
            migrated: false,
            skipped: true,
            reason: "already migrated".to_string(),
            imported_count: 0,
            complete: true,
        });
    }

    db.get_or_create(&uid).map_err(|e| e.to_string())?;

    let tried_paths = candidates
        .iter()
        .map(|item| format!("{}:{:?}", item.source, item.path))
        .collect::<Vec<_>>()
        .join(", ");
    let previous_fingerprints = migration_source_fingerprints(&app_data_dir, &uid)?;
    let mut source_fingerprints = previous_fingerprints.clone();
    let mut processed_fingerprints = HashSet::new();
    let mut imported_sources = Vec::new();
    let mut total_imported_count = 0usize;
    let mut last_reason = "legacy cache not found".to_string();
    for candidate in &candidates {
        let Some(fingerprint) = legacy_cache_fingerprint(&candidate.path)? else {
            continue;
        };
        let path_key = candidate.path.to_string_lossy().to_string();
        if previous_fingerprints.get(&path_key) == Some(&fingerprint) {
            continue;
        }
        // 安装器备份与还原后的原路径通常是同一份 abc，同次只解密/导入一次。
        if !processed_fingerprints.insert(fingerprint.clone()) {
            source_fingerprints.insert(path_key, fingerprint);
            continue;
        }

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
        total_imported_count = total_imported_count.saturating_add(imported_count);
        source_fingerprints.insert(path_key, fingerprint);
        imported_sources.push(candidate.source);
    }

    if !imported_sources.is_empty() {
        imported_sources.sort_unstable();
        imported_sources.dedup();
        let sources = imported_sources.join("+");
        mark_uid_migrated(
            &app_data_dir,
            &uid,
            LegacyMigrationRecord {
                uid: uid.clone(),
                migrated_at: chrono::Utc::now().timestamp_millis(),
                source: format!("temp_cache:{}:{}", brand_id, sources),
                imported_count: total_imported_count,
                source_fingerprints,
            },
        )?;

        info!(
            "[legacy-migration] imported uid={} brand={} count={} sources={}",
            uid, brand_id, total_imported_count, sources
        );

        return Ok(LegacyMigrationResult {
            attempted: true,
            migrated: true,
            skipped: false,
            reason: format!("imported from legacy temp cache ({sources})"),
            imported_count: total_imported_count,
            complete: true,
        });
    }

    info!(
        "[legacy-migration] no legacy cache uid={} brand={} legacy_user_data={} tried={}",
        uid,
        brand_id,
        branding::legacy_electron_user_data_name(brand_id),
        tried_paths
    );

    if should_skip_indexeddb_rescan(&app_data_dir, db, &uid)? {
        return Ok(LegacyMigrationResult {
            attempted: true,
            migrated: false,
            skipped: true,
            reason: "indexeddb already imported; waiting for abc".to_string(),
            imported_count: 0,
            complete: false,
        });
    }

    let backup_root = app_data_dir.join("legacy-electron-backup");
    let indexeddb_roots = legacy_indexeddb::legacy_electron_user_data_paths_with_backup(
        brand_id,
        Some(backup_root.as_path()),
    );
    for user_data_path in indexeddb_roots {
        let (history_obj, import_score) =
            legacy_indexeddb::import_history_from_user_data(&user_data_path, &uid);
        if history_obj.is_empty() || import_score == 0 {
            continue;
        }

        let imported_count = db
            .with_connection(&uid, |conn| {
                cleanup_empty_legacy_placeholders(conn)?;
                account_transfer::import_history_value(conn, &uid, &history_obj)
            })
            .map_err(|e| e.to_string())?;

        // IndexedDB 可能不全：标记后仍允许后续 abc 补导（见 has_complete_temp_cache_migration）。
        if imported_count > 0 {
            mark_uid_migrated(
                &app_data_dir,
                &uid,
                LegacyMigrationRecord {
                    uid: uid.clone(),
                    migrated_at: chrono::Utc::now().timestamp_millis(),
                    source: format!(
                        "indexeddb:v{}:{}:{}",
                        INDEXEDDB_EXTRACTOR_VERSION,
                        brand_id,
                        user_data_path.to_string_lossy()
                    ),
                    imported_count,
                    source_fingerprints: HashMap::new(),
                },
            )?;
        }

        info!(
            "[legacy-migration] imported uid={} brand={} count={} from indexeddb {:?}",
            uid, brand_id, imported_count, user_data_path
        );

        return Ok(LegacyMigrationResult {
            attempted: true,
            migrated: imported_count > 0,
            skipped: imported_count == 0,
            reason: if imported_count > 0 {
                "imported from legacy electron indexeddb".to_string()
            } else {
                "legacy indexeddb tables found but no messages parsed".to_string()
            },
            imported_count,
            complete: false,
        });
    }

    Ok(LegacyMigrationResult {
        attempted: true,
        migrated: false,
        skipped: true,
        reason: last_reason,
        imported_count: 0,
        complete: false,
    })
}

fn legacy_cache_candidates(
    uid: &str,
    brand_id: &str,
    app_data_dir: &Path,
) -> Vec<LegacyCacheCandidate> {
    let mut candidates = Vec::new();
    let mut seen_paths = HashMap::<String, ()>::new();

    let mut push_path = |path: PathBuf, cache_key: &'static str, source: &'static str| {
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

    let backup_root = app_data_dir.join("legacy-electron-backup");
    // 安装器备份的 Temp abc 优先（卸载后原 %TEMP% 也可能被清过）。
    for brand in [brand_id, "55", "45", "97"] {
        let dir_name = branding::legacy_temp_storage_dir_name(brand);
        let key = branding::legacy_history_cache_key(brand);
        push_path(
            backup_root
                .join(&dir_name)
                .join(format!("user-{uid}"))
                .join("abc"),
            key,
            "installer-backup",
        );
    }
    push_path(
        backup_root
            .join("68LocalStorage")
            .join(format!("user-{uid}"))
            .join("abc"),
        "6854",
        "installer-backup-68",
    );

    // 当前渠道优先；同时兼容旧包曾写过的 45/55/68/97 Temp 目录。
    // 解密时会对同一文件再尝试其它常见 key（见 read_legacy_history_from_cache）。
    for brand in [brand_id, "55", "45", "97"] {
        let dir_name = branding::legacy_temp_storage_dir_name(brand);
        let key = branding::legacy_history_cache_key(brand);
        let source = if brand == brand_id { "brand" } else { "legacy-scan" };
        for path in discover_legacy_abc_paths(uid, &dir_name) {
            push_path(path, key, source);
        }
    }
    for path in discover_legacy_abc_paths(uid, "68LocalStorage") {
        push_path(path, "6854", "legacy68");
    }

    candidates
}

fn read_legacy_history_from_cache(
    candidate: &LegacyCacheCandidate,
) -> Result<Option<(String, Map<String, Value>)>, String> {
    if !candidate.path.is_file() {
        return Ok(None);
    }

    let encrypted = std::fs::read(&candidate.path)
        .map_err(|e| format!("failed to read legacy cache {:?}: {}", candidate.path, e))?;

    // 旧 Electron cacheDB.js 用 CryptoJS AES-ECB + 4 字节 key（如 5554）加密。
    // 同一 abc 文件可能被不同渠道 key 写出，主 key 失败时再试其它常见 key。
    let mut keys = vec![candidate.cache_key];
    for fallback in ["5554", "4554", "6854", "9754"] {
        if !keys.contains(&fallback) {
            keys.push(fallback);
        }
    }

    let mut decrypted = None;
    let mut last_err = None;
    for key in keys {
        match aes::decrypt_cryptojs_ecb(&encrypted, key) {
            Ok(value) => {
                decrypted = Some(value);
                break;
            }
            Err(err) => last_err = Some((key, err)),
        }
    }

    let decrypted = match decrypted {
        Some(value) => value,
        None => {
            let (key, err) = last_err.unwrap();
            warn!(
                "[legacy-migration] decrypt failed source={} path={:?} last_key={}: {}",
                candidate.source, candidate.path, key, err
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

fn migration_source_fingerprints(
    app_data_dir: &Path,
    uid: &str,
) -> Result<HashMap<String, String>, String> {
    let store = read_migration_store(app_data_dir)?;
    let Some(record) = store.records.get(uid) else {
        return Ok(HashMap::new());
    };
    if !record.source.starts_with("temp_cache:") {
        return Ok(HashMap::new());
    }
    Ok(record.source_fingerprints.clone())
}

fn legacy_cache_fingerprint(path: &Path) -> Result<Option<String>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    let bytes = std::fs::read(path)
        .map_err(|e| format!("failed to fingerprint legacy cache {:?}: {}", path, e))?;
    Ok(Some(format!("{:x}", Sha256::digest(bytes))))
}

fn has_unchanged_complete_temp_cache_migration(
    app_data_dir: &Path,
    uid: &str,
    candidates: &[LegacyCacheCandidate],
) -> Result<bool, String> {
    let source_fingerprints = migration_source_fingerprints(app_data_dir, uid)?;
    // 旧版完成记录没有指纹：升级后必须补扫一次，不能永久跳过。
    if source_fingerprints.is_empty() {
        return Ok(false);
    }

    for candidate in candidates {
        let Some(current) = legacy_cache_fingerprint(&candidate.path)? else {
            continue;
        };
        let path_key = candidate.path.to_string_lossy();
        if source_fingerprints.get(path_key.as_ref()) != Some(&current) {
            return Ok(false);
        }
    }
    Ok(true)
}

fn should_skip_indexeddb_rescan(
    app_data_dir: &Path,
    db: &DbManager,
    uid: &str,
) -> Result<bool, String> {
    let store = read_migration_store(app_data_dir)?;
    let Some(record) = store.records.get(uid) else {
        return Ok(false);
    };
    if record.source.starts_with("temp_cache:") {
        return Ok(true);
    }
    if !record.source.starts_with("indexeddb:") {
        return Ok(false);
    }
    // 抽取算法升级后允许再扫一次，补全此前漏掉的单聊/群聊。
    let version_prefix = format!("indexeddb:v{INDEXEDDB_EXTRACTOR_VERSION}:");
    if !record.source.starts_with(&version_prefix) {
        return Ok(false);
    }
    let friend_group_count = db
        .with_connection(uid, count_friend_group_messages)
        .map_err(|e| e.to_string())?;
    // 已扫过 IndexedDB 且本地已有单聊/群聊时，跳过昂贵重扫；abc 仍会在函数前半段尝试。
    Ok(friend_group_count > 0)
}

fn cleanup_empty_legacy_placeholders(conn: &Connection) -> Result<(), crate::db::DbError> {
    // 旧版 IndexedDB 解析曾把中文 content 剥成空串，留下空气泡；重扫前清掉这类占位。
    conn.execute(
        "DELETE FROM messages
         WHERE (content IS NULL OR trim(content) = '')
           AND (id LIKE 'legacy_%' OR IFNULL(custom_msg_id, '') LIKE 'legacy_custom_%')
           AND (conversation_id GLOB '0_*' OR conversation_id GLOB '1_*')",
        [],
    )
    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
    Ok(())
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
    legacy_temp_cache_file_with_dir(uid, &branding::legacy_temp_storage_dir_name(brand_id))
}

fn legacy_temp_cache_file_with_dir(uid: &str, dir_name: &str) -> PathBuf {
    std::env::temp_dir()
        .join(dir_name)
        .join(format!("user-{uid}"))
        .join("abc")
}

/// Mac 上 Electron / Tauri 的 TMPDIR 偶发不一致，且 /var/folders 会话目录会轮换。
/// 额外扫常见临时根，把能找到的 `*/{brand}LocalStorage/user-{uid}/abc` 都纳入候选。
fn discover_legacy_abc_paths(uid: &str, dir_name: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut seen = HashMap::<String, ()>::new();
    let mut push = |path: PathBuf| {
        let key = path.to_string_lossy().to_string();
        if seen.contains_key(&key) {
            return;
        }
        seen.insert(key, ());
        paths.push(path);
    };

    let rel = PathBuf::from(dir_name)
        .join(format!("user-{uid}"))
        .join("abc");
    push(std::env::temp_dir().join(&rel));
    if let Ok(tmpdir) = std::env::var("TMPDIR") {
        push(PathBuf::from(tmpdir).join(&rel));
    }
    push(PathBuf::from("/tmp").join(&rel));

    #[cfg(target_os = "macos")]
    {
        // 扫当前用户可见临时根下已有的 *LocalStorage（深度有限，避免全盘）。
        for root in [std::env::temp_dir(), PathBuf::from("/tmp")] {
            let Ok(entries) = std::fs::read_dir(&root) else {
                continue;
            };
            for entry in entries.flatten() {
                let name = entry.file_name();
                let Some(name) = name.to_str() else {
                    continue;
                };
                if name != dir_name && !name.ends_with("LocalStorage") {
                    continue;
                }
                if name == dir_name {
                    push(entry.path().join(format!("user-{uid}")).join("abc"));
                }
            }
            // /var/folders/.../T 的父级偶发挂着其它 T 会话；只跟一层 sibling T。
            if let Some(parent) = root.parent() {
                if let Ok(siblings) = std::fs::read_dir(parent) {
                    for sibling in siblings.flatten().take(32) {
                        let candidate = sibling.path().join(dir_name).join(format!("user-{uid}")).join("abc");
                        if candidate.is_file() {
                            push(candidate);
                        }
                    }
                }
            }
        }
    }

    paths
}

fn normalize_legacy_history_payload(
    payload: &Value,
) -> Result<(String, Map<String, Value>), String> {
    let payload_obj = payload
        .as_object()
        .ok_or_else(|| "legacy payload must be an object".to_string())?;

    let explicit_uid = payload_obj
        .get("uid")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();

    let history_value = payload_obj
        .get("history")
        .ok_or_else(|| "legacy payload history is missing".to_string())?;

    let history_obj = if let Some(history_obj) = history_value.as_object() {
        history_obj.clone()
    } else if let Some(items) = history_value.as_array() {
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
        history_obj
    } else {
        return Err("legacy payload history has unsupported format".to_string());
    };

    // 官网 Electron 包的 cacheDB.js 有些版本只写 `{ history }`，
    // uid 仍在 `<uid>-message.man...` 等 object-store 名中。
    let uid = if explicit_uid.is_empty() {
        infer_uid_from_legacy_history(&history_obj)
            .ok_or_else(|| "legacy payload uid is missing".to_string())?
    } else {
        explicit_uid
    };

    Ok((uid, history_obj))
}

fn infer_uid_from_legacy_history(history: &Map<String, Value>) -> Option<String> {
    const TABLE_MARKERS: [&str; 3] = [
        "-message.man",
        "-groupMessage.man",
        "-channelMessage.man",
    ];

    history.keys().find_map(|table_name| {
        TABLE_MARKERS.iter().find_map(|marker| {
            let (uid, _) = table_name.split_once(marker)?;
            let uid = uid.trim();
            if !uid.is_empty() && uid.chars().all(|ch| ch.is_ascii_digit()) {
                Some(uid.to_string())
            } else {
                None
            }
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn legacy_cache_candidates_include_cross_brand_temp_dirs() {
        let app_data = std::env::temp_dir().join(format!(
            "legacy-mig-test-{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&app_data);
        let candidates = legacy_cache_candidates("123", "45", &app_data);
        let sources: Vec<_> = candidates.iter().map(|c| c.source).collect();
        assert!(sources.contains(&"installer-backup"));
        assert!(sources.contains(&"brand"));
        assert!(sources.iter().any(|s| *s == "legacy-scan" || *s == "legacy68"));
        let brand = candidates
            .iter()
            .find(|c| c.source == "brand")
            .expect("brand candidate");
        assert_eq!(brand.cache_key, "4554");
        assert!(candidates.iter().any(|c| {
            c.cache_key == "5554"
                && c.path
                    .to_string_lossy()
                    .contains("55LocalStorage/user-123/abc")
        }));
        assert!(candidates.iter().any(|c| {
            c.source == "installer-backup"
                && c.path.ends_with(Path::new("45LocalStorage/user-123/abc"))
        }));
        let _ = std::fs::remove_dir_all(&app_data);
    }

    #[test]
    fn legacy_cache_candidates_for_97_skip_duplicate_97_dir() {
        let app_data = std::env::temp_dir().join(format!(
            "legacy-mig-test-97-{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&app_data);
        let candidates = legacy_cache_candidates("123", "97", &app_data);
        let sources: Vec<_> = candidates.iter().map(|c| c.source).collect();
        assert!(sources.contains(&"installer-backup"));
        assert!(sources.contains(&"brand"));
        let brand = candidates
            .iter()
            .find(|c| c.source == "brand")
            .expect("brand candidate");
        assert_eq!(brand.cache_key, "9754");
        assert!(candidates.iter().any(|c| c.cache_key == "5554"));
        assert!(candidates.iter().any(|c| c.cache_key == "4554"));
        assert!(candidates.iter().any(|c| c.cache_key == "6854"));
        let _ = std::fs::remove_dir_all(&app_data);
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
    fn normalize_history_payload_infers_uid_from_legacy_table_name() {
        // 旧 Electron cacheDB.js 实际写出的 abc 可能只有 history，没有 uid。
        // 账号 id 仍然稳定地编码在每个历史表名前缀中。
        let payload = json!({
            "history": [
                { "name": "10001-message.man200", "list": [{ "sendTime": 1 }] },
                { "name": "10001-groupMessage.man300", "list": [{ "sendTime": 2 }] }
            ]
        });

        let (uid, history) = normalize_legacy_history_payload(&payload).unwrap();
        assert_eq!(uid, "10001");
        assert_eq!(history.len(), 2);
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

    #[test]
    fn completed_temp_cache_migration_is_invalidated_when_source_changes() {
        let app_data = std::env::temp_dir().join(format!(
            "legacy-mig-fingerprint-test-{}",
            std::process::id()
        ));
        let cache_path = app_data.join("55LocalStorage/user-123/abc");
        std::fs::create_dir_all(cache_path.parent().expect("cache parent"))
            .expect("create cache parent");
        std::fs::write(&cache_path, b"first cache revision").expect("write first cache");

        let candidate = LegacyCacheCandidate {
            path: cache_path.clone(),
            cache_key: "5554",
            source: "brand",
        };
        let fingerprint = legacy_cache_fingerprint(&cache_path)
            .expect("fingerprint cache")
            .expect("cache exists");
        mark_uid_migrated(
            &app_data,
            "123",
            LegacyMigrationRecord {
                uid: "123".to_string(),
                migrated_at: 1,
                source: "temp_cache:55:brand".to_string(),
                imported_count: 2,
                source_fingerprints: HashMap::from([(
                    cache_path.to_string_lossy().to_string(),
                    fingerprint,
                )]),
            },
        )
        .expect("mark migrated");

        assert!(has_unchanged_complete_temp_cache_migration(
            &app_data,
            "123",
            std::slice::from_ref(&candidate),
        )
        .expect("unchanged migration state"));

        std::fs::write(&cache_path, b"second cache revision with new messages")
            .expect("write changed cache");
        assert!(
            !has_unchanged_complete_temp_cache_migration(&app_data, "123", &[candidate],)
                .expect("changed migration state")
        );

        let _ = std::fs::remove_dir_all(&app_data);
    }

    #[test]
    fn legacy_completion_record_without_fingerprints_is_rescanned_once() {
        let app_data = std::env::temp_dir().join(format!(
            "legacy-mig-old-record-test-{}",
            std::process::id()
        ));
        let cache_path = app_data.join("55LocalStorage/user-123/abc");
        std::fs::create_dir_all(cache_path.parent().expect("cache parent"))
            .expect("create cache parent");
        std::fs::write(&cache_path, b"cache written after the old migration marker")
            .expect("write cache");
        std::fs::create_dir_all(&app_data).expect("create app data");
        std::fs::write(
            migration_store_path(&app_data),
            r#"{
              "records": {
                "123": {
                  "uid": "123",
                  "migratedAt": 1,
                  "source": "temp_cache:55:brand",
                  "importedCount": 2
                }
              }
            }"#,
        )
        .expect("write old migration marker");

        let candidate = LegacyCacheCandidate {
            path: cache_path,
            cache_key: "5554",
            source: "brand",
        };
        assert!(
            !has_unchanged_complete_temp_cache_migration(&app_data, "123", &[candidate],)
                .expect("old marker state")
        );

        let _ = std::fs::remove_dir_all(&app_data);
    }
}
