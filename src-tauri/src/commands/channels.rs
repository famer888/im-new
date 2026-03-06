use tauri::State;

use crate::db::{models, DbManager};

#[tauri::command]
pub async fn get_channels(
    db: State<'_, DbManager>,
    uid: String,
) -> Result<Vec<models::Channel>, String> {
    db.with_connection(&uid, |conn| {
        let mut stmt = conn
            .prepare_cached(
                "SELECT id, name, avatar, owner_id, description, updated_at
                 FROM channels ORDER BY updated_at DESC",
            )
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(models::Channel {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    avatar: row.get(2)?,
                    owner_id: row.get(3)?,
                    description: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_channel_info(
    db: State<'_, DbManager>,
    uid: String,
    channel_id: String,
) -> Result<models::Channel, String> {
    db.with_connection(&uid, |conn| {
        let mut stmt = conn
            .prepare_cached(
                "SELECT id, name, avatar, owner_id, description, updated_at
                 FROM channels WHERE id = ?1",
            )
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

        stmt.query_row(rusqlite::params![channel_id], |row| {
            Ok(models::Channel {
                id: row.get(0)?,
                name: row.get(1)?,
                avatar: row.get(2)?,
                owner_id: row.get(3)?,
                description: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|_| crate::db::DbError::NotFound)
    })
    .map_err(|e| e.to_string())
}
