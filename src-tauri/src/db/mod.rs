pub mod migrations;
pub mod models;
pub mod queries;

use parking_lot::RwLock;
use rusqlite::Connection;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tracing::{error, info};

pub struct DbManager {
    app_data_dir: PathBuf,
    connections: RwLock<HashMap<String, Connection>>,
}

impl DbManager {
    pub fn new(app_data_dir: &Path) -> Result<Self, DbError> {
        let db_dir = app_data_dir.join("databases");
        std::fs::create_dir_all(&db_dir)
            .map_err(|e| DbError::IoError(e.to_string()))?;

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
        let conn = Connection::open(&db_path)
            .map_err(|e| DbError::SqliteError(e.to_string()))?;

        // WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=10000; PRAGMA temp_store=MEMORY;")
            .map_err(|e| DbError::SqliteError(e.to_string()))?;

        migrations::run_migrations(&conn)?;
        conns.insert(uid.to_string(), conn);
        info!("Database initialized for user: {}", uid);
        Ok(())
    }

    pub fn with_connection<F, R>(&self, uid: &str, f: F) -> Result<R, DbError>
    where
        F: FnOnce(&Connection) -> Result<R, DbError>,
    {
        let conns = self.connections.read();
        let conn = conns
            .get(uid)
            .ok_or_else(|| DbError::NotInitialized(uid.to_string()))?;
        f(conn)
    }

    pub fn close(&self, uid: &str) {
        let mut conns = self.connections.write();
        if let Some(conn) = conns.remove(uid) {
            drop(conn);
            info!("Database closed for user: {}", uid);
        }
    }

    pub fn close_all(&self) {
        let mut conns = self.connections.write();
        conns.clear();
        info!("All databases closed");
    }
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
