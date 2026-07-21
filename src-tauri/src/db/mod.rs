pub mod migrations;
pub mod models;
pub mod queries;

use parking_lot::RwLock;
use rusqlite::Connection;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tracing::{info, warn};

/// 覆盖安装 / 多窗口 / 迁移导入时，SQLite 可能短暂 busy；等待后重试而不是立刻失败。
const DB_BUSY_TIMEOUT: Duration = Duration::from_secs(30);
const DB_OPEN_MAX_ATTEMPTS: u32 = 8;

pub struct DbManager {
    app_data_dir: PathBuf,
    connections: RwLock<HashMap<String, Mutex<Connection>>>,
}

impl DbManager {
    pub fn new(app_data_dir: &Path) -> Result<Self, DbError> {
        let db_dir = app_data_dir.join("databases");
        std::fs::create_dir_all(&db_dir).map_err(|e| DbError::IoError(e.to_string()))?;

        Ok(Self {
            app_data_dir: db_dir,
            connections: RwLock::new(HashMap::new()),
        })
    }

    pub fn get_or_create(&self, uid: &str) -> Result<(), DbError> {
        let mut conns = self.connections.write();
        if conns.contains_key(uid) {
            return Ok(());
        }

        let db_path = self.app_data_dir.join(format!("{}.db", uid));
        let conn = open_configured_connection(&db_path)?;
        conns.insert(uid.to_string(), Mutex::new(conn));
        info!("Database initialized for user: {}", uid);
        Ok(())
    }

    pub fn with_connection<F, R>(&self, uid: &str, f: F) -> Result<R, DbError>
    where
        F: FnOnce(&Connection) -> Result<R, DbError>,
    {
        let conns = self.connections.read();
        let mtx = conns
            .get(uid)
            .ok_or_else(|| DbError::NotInitialized(uid.to_string()))?;
        let conn = mtx
            .lock()
            .map_err(|e| DbError::SqliteError(format!("Mutex poisoned: {}", e)))?;
        f(&conn)
    }

    pub fn close(&self, uid: &str) {
        let mut conns = self.connections.write();
        if conns.remove(uid).is_some() {
            info!("Database closed for user: {}", uid);
        }
    }

    pub fn close_all(&self) {
        let mut conns = self.connections.write();
        conns.clear();
        info!("All databases closed");
    }

    /// 关闭并删除当前账号本地库（异常修复「重置缓存数据」）
    pub fn delete_user_database(&self, uid: &str) -> Result<(), DbError> {
        self.close(uid);
        let db_path = self.app_data_dir.join(format!("{uid}.db"));
        if db_path.exists() {
            std::fs::remove_file(&db_path).map_err(|e| DbError::IoError(e.to_string()))?;
        }
        let _ = std::fs::remove_file(self.app_data_dir.join(format!("{uid}.db-wal")));
        let _ = std::fs::remove_file(self.app_data_dir.join(format!("{uid}.db-shm")));
        info!("User database removed: {}", uid);
        Ok(())
    }
}

fn is_sqlite_busy_message(msg: &str) -> bool {
    let lower = msg.to_ascii_lowercase();
    lower.contains("database is locked")
        || lower.contains("database is busy")
        || lower.contains("sqlite_busy")
        || lower.contains("locked")
}

fn open_configured_connection(db_path: &Path) -> Result<Connection, DbError> {
    let mut last_err: Option<DbError> = None;

    for attempt in 1..=DB_OPEN_MAX_ATTEMPTS {
        match try_open_configured_connection(db_path) {
            Ok(conn) => return Ok(conn),
            Err(err) => {
                let busy = match &err {
                    DbError::SqliteError(msg) => is_sqlite_busy_message(msg),
                    _ => false,
                };
                if !busy || attempt == DB_OPEN_MAX_ATTEMPTS {
                    return Err(err);
                }
                warn!(
                    "[db] open busy path={:?} attempt={}/{}, retrying: {}",
                    db_path, attempt, DB_OPEN_MAX_ATTEMPTS, err
                );
                last_err = Some(err);
                thread::sleep(Duration::from_millis(40 * u64::from(attempt)));
            }
        }
    }

    Err(last_err.unwrap_or_else(|| {
        DbError::SqliteError("database is locked".to_string())
    }))
}

fn try_open_configured_connection(db_path: &Path) -> Result<Connection, DbError> {
    let conn = Connection::open(db_path).map_err(|e| DbError::SqliteError(e.to_string()))?;

    // 必须先于迁移 / WAL 切换设置，否则 BEGIN IMMEDIATE 会立刻 SQLITE_BUSY。
    conn.busy_timeout(DB_BUSY_TIMEOUT)
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA cache_size=10000;
         PRAGMA temp_store=MEMORY;
         PRAGMA busy_timeout=30000;",
    )
    .map_err(|e| DbError::SqliteError(e.to_string()))?;

    migrations::run_migrations(&conn)?;
    Ok(conn)
}

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("SQLite error: {0}")]
    SqliteError(String),
    #[error("IO error: {0}")]
    IoError(String),
    #[error("Database not initialized for user: {0}")]
    NotInitialized(String),
    #[error("Not found")]
    NotFound,
}

impl serde::Serialize for DbError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn open_configured_connection_sets_busy_timeout() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("ocs-db-busy-{stamp}"));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let path = dir.join("user.db");

        let conn = open_configured_connection(&path).expect("open db");
        let timeout: i64 = conn
            .pragma_query_value(None, "busy_timeout", |row| row.get(0))
            .expect("read busy_timeout");
        assert!(timeout >= 30000, "busy_timeout={timeout}");

        drop(conn);
        let _ = std::fs::remove_dir_all(dir);
    }
}
