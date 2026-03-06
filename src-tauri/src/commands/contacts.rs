use tauri::State;

use crate::db::{models, queries, DbManager};

#[tauri::command]
pub async fn get_contacts(
    db: State<'_, DbManager>,
    uid: String,
) -> Result<Vec<models::Contact>, String> {
    db.with_connection(&uid, |conn| queries::get_contacts(conn))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_contacts(
    db: State<'_, DbManager>,
    uid: String,
    keyword: String,
) -> Result<Vec<models::Contact>, String> {
    db.with_connection(&uid, |conn| {
        let mut stmt = conn
            .prepare_cached(
                "SELECT id, nickname, avatar, pinyin, remark, status, updated_at 
                 FROM contacts 
                 WHERE nickname LIKE ?1 OR pinyin LIKE ?1 OR remark LIKE ?1
                 ORDER BY pinyin ASC",
            )
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

        let pattern = format!("%{}%", keyword);
        let rows = stmt
            .query_map(rusqlite::params![pattern], |row| {
                Ok(models::Contact {
                    id: row.get(0)?,
                    nickname: row.get(1)?,
                    avatar: row.get(2)?,
                    pinyin: row.get(3)?,
                    remark: row.get(4)?,
                    status: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_contact(uid: String, target_id: String, message: String) -> Result<(), String> {
    // TODO: Send add contact request via WS
    Ok(())
}

#[tauri::command]
pub async fn delete_contact(
    db: State<'_, DbManager>,
    uid: String,
    contact_id: String,
) -> Result<(), String> {
    db.with_connection(&uid, |conn| {
        conn.execute(
            "DELETE FROM contacts WHERE id = ?1",
            rusqlite::params![contact_id],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        Ok(())
    })
    .map_err(|e| e.to_string())
}
