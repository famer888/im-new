use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::{models, queries, DbManager};

#[derive(Debug, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub conversation_id: String,
    pub msg_type: i32,
    pub content: String,
    pub extra: Option<serde_json::Value>,
}

#[tauri::command]
pub async fn get_conversations(
    db: State<'_, DbManager>,
    uid: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<models::Conversation>, String> {
    db.get_or_create(&uid).map_err(|e| e.to_string())?;
    db.with_connection(&uid, |conn| {
        queries::ensure_file_helper_conversation(conn)?;
        queries::get_conversations(conn, limit.unwrap_or(50), offset.unwrap_or(0))
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_messages(
    db: State<'_, DbManager>,
    uid: String,
    conversation_id: String,
    before_time: Option<i64>,
    limit: Option<i64>,
) -> Result<Vec<models::Message>, String> {
    db.with_connection(&uid, |conn| {
        queries::get_messages(conn, &conversation_id, before_time, limit.unwrap_or(50))
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_message(
    db: State<'_, DbManager>,
    ws_mgr: State<'_, crate::ws::WsManager>,
    crypto: State<'_, crate::crypto::CryptoEngine>,
    uid: String,
    request: SendMessageRequest,
) -> Result<models::Message, String> {
    let msg_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let message = models::Message {
        id: msg_id.clone(),
        custom_msg_id: Some(msg_id.clone()),
        conversation_id: request.conversation_id.clone(),
        sender_id: uid.clone(),
        msg_type: request.msg_type,
        content: Some(request.content.clone()),
        send_time: now,
        // 当前 send -> WS 回执链路尚未接入（下方 TODO），否则会永久“发送中”。
        // 先与旧版体验对齐：本地入库即视为“已发送”。
        status: 1,
        read_status: 0,
        version: 0,
        is_deleted: false,
        extra: request.extra.map(|e| e.to_string()),
    };

    // Save to local DB first
    db.with_connection(&uid, |conn| {
        queries::insert_message(conn, &message)
    })
    .map_err(|e| e.to_string())?;

    // TODO: Encrypt and send via WebSocket
    // 1. Get shared key for target
    // 2. Encrypt content
    // 3. Build protobuf message
    // 4. Send via WS

    Ok(message)
}

#[tauri::command]
pub async fn mark_as_read(
    db: State<'_, DbManager>,
    uid: String,
    conversation_id: String,
) -> Result<(), String> {
    db.with_connection(&uid, |conn| {
        conn.execute(
            "UPDATE conversations SET unread_count = 0 WHERE id = ?1",
            rusqlite::params![conversation_id],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        Ok(())
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_message(
    db: State<'_, DbManager>,
    uid: String,
    message_id: String,
) -> Result<(), String> {
    db.with_connection(&uid, |conn| {
        conn.execute(
            "UPDATE messages SET is_deleted = 1 WHERE id = ?1",
            rusqlite::params![message_id],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        Ok(())
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pin_conversation(
    db: State<'_, DbManager>,
    uid: String,
    conversation_id: String,
    pinned: bool,
) -> Result<(), String> {
    db.with_connection(&uid, |conn| {
        conn.execute(
            "UPDATE conversations SET is_pinned = ?1 WHERE id = ?2",
            rusqlite::params![pinned as i32, conversation_id],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        Ok(())
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mute_conversation(
    db: State<'_, DbManager>,
    uid: String,
    conversation_id: String,
    muted: bool,
) -> Result<(), String> {
    db.with_connection(&uid, |conn| {
        conn.execute(
            "UPDATE conversations SET is_muted = ?1 WHERE id = ?2",
            rusqlite::params![muted as i32, conversation_id],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        Ok(())
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn archive_conversation(
    db: State<'_, DbManager>,
    uid: String,
    conversation_id: String,
    archived: bool,
) -> Result<(), String> {
    db.with_connection(&uid, |conn| {
        conn.execute(
            "UPDATE conversations SET is_archived = ?1 WHERE id = ?2",
            rusqlite::params![archived as i32, conversation_id],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        Ok(())
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn recall_message(
    db: State<'_, DbManager>,
    ws_mgr: State<'_, crate::ws::WsManager>,
    uid: String,
    message_id: String,
) -> Result<(), String> {
    db.with_connection(&uid, |conn| {
        conn.execute(
            "UPDATE messages SET status = -2, content = '[消息已撤回]' WHERE id = ?1 AND sender_id = ?2",
            rusqlite::params![message_id, uid],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        Ok(())
    })
    .map_err(|e| e.to_string())?;

    // TODO: send recall command via WebSocket

    Ok(())
}

#[tauri::command]
pub async fn delete_conversation(
    db: State<'_, DbManager>,
    uid: String,
    conversation_id: String,
) -> Result<(), String> {
    db.with_connection(&uid, |conn| {
        conn.execute(
            "DELETE FROM conversations WHERE id = ?1",
            rusqlite::params![conversation_id],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        Ok(())
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_messages(
    db: State<'_, DbManager>,
    uid: String,
    keyword: String,
    limit: Option<i64>,
    conversation_id: Option<String>,
) -> Result<Vec<models::Message>, String> {
    db.with_connection(&uid, |conn| {
        queries::search_messages(
            conn,
            &keyword,
            conversation_id.as_deref(),
            limit.unwrap_or(50),
        )
    })
    .map_err(|e| e.to_string())
}

/// 清空当前账号本地全部聊天消息与会话摘要（与 im「清空全部聊天记录」本地侧一致）
#[tauri::command]
pub async fn clear_all_local_chat_history(
    db: State<'_, DbManager>,
    uid: String,
) -> Result<(), String> {
    db.with_connection(&uid, |conn| {
        conn.execute("DELETE FROM messages", [])
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        conn.execute(
            "UPDATE conversations SET last_msg_id = NULL, last_msg_time = 0, \
             last_msg_digest = NULL, unread_count = 0, draft = NULL, at_me = 0",
            [],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        Ok(())
    })
    .map_err(|e| e.to_string())
}
