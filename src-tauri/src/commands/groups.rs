use tauri::State;

use crate::db::{models, queries, DbManager};

#[tauri::command]
pub async fn get_groups(
    db: State<'_, DbManager>,
    uid: String,
) -> Result<Vec<models::Group>, String> {
    db.with_connection(&uid, |conn| queries::get_groups(conn))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_group_members(
    db: State<'_, DbManager>,
    uid: String,
    group_id: String,
) -> Result<Vec<models::GroupMember>, String> {
    db.with_connection(&uid, |conn| queries::get_group_members(conn, &group_id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_group(uid: String, name: String, member_ids: Vec<String>) -> Result<(), String> {
    // TODO: Send create group request via WS
    Ok(())
}

#[tauri::command]
pub async fn invite_members(
    uid: String,
    group_id: String,
    member_ids: Vec<String>,
) -> Result<(), String> {
    // TODO: Send invite request via WS
    Ok(())
}
