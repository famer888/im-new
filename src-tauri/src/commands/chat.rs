use serde::{Deserialize, Serialize};
use prost::Message as _;
use tauri::State;
use tracing::{error, warn};

use crate::crypto::CryptoEngine;
use crate::db::{models, queries, DbManager};
use crate::messaging::pipeline;
use crate::ws::WsManager;

#[derive(Debug, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub conversation_id: String,
    pub msg_type: i32,
    pub content: String,
    pub extra: Option<serde_json::Value>,
    /// 前端生成的 customMsgId（对齐老 im 的 flag）。
    pub custom_msg_id: Option<String>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingMessagePayload {
    pub id: String,
    pub custom_msg_id: Option<String>,
    pub conversation_id: String,
    pub sender_id: String,
    pub msg_type: i32,
    pub content: Option<String>,
    pub send_time: i64,
    pub status: Option<i32>,
    pub read_status: Option<i32>,
    pub version: Option<i64>,
    pub is_deleted: Option<bool>,
    pub extra: Option<serde_json::Value>,
}

/// 入站消息落库（用于 WS 推送消息的本地历史持久化）。
#[tauri::command]
pub async fn upsert_incoming_messages(
    db: State<'_, DbManager>,
    uid: String,
    messages: Vec<IncomingMessagePayload>,
) -> Result<usize, String> {
    if messages.is_empty() {
        return Ok(0);
    }

    db.with_connection(&uid, |conn| {
        let mut rows: Vec<models::Message> = Vec::with_capacity(messages.len());
        for item in &messages {
            if item.id.trim().is_empty() || item.conversation_id.trim().is_empty() {
                continue;
            }
            rows.push(models::Message {
                id: item.id.clone(),
                custom_msg_id: item.custom_msg_id.clone(),
                conversation_id: item.conversation_id.clone(),
                sender_id: item.sender_id.clone(),
                msg_type: item.msg_type,
                content: item.content.clone(),
                send_time: item.send_time,
                status: item.status.unwrap_or(1),
                read_status: item.read_status.unwrap_or(0),
                version: item.version.unwrap_or(0),
                is_deleted: item.is_deleted.unwrap_or(false),
                extra: item.extra.as_ref().map(|e| e.to_string()),
            });
        }

        if rows.is_empty() {
            return Ok(0usize);
        }

        queries::batch_insert_messages(conn, &rows)?;

        for msg in &rows {
            let (conv_type, target_id) = parse_conversation_id(&msg.conversation_id)
                .unwrap_or((0, String::new()));
            conn.execute(
                "INSERT OR IGNORE INTO conversations (id, type, target_id, updated_at)
                 VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![msg.conversation_id, conv_type, target_id, msg.send_time],
            )
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
            conn.execute(
                "UPDATE conversations
                 SET last_msg_id = ?1,
                     last_msg_time = ?2,
                     last_msg_digest = ?3,
                     updated_at = ?2
                 WHERE id = ?4
                   AND (last_msg_time IS NULL OR last_msg_time <= ?2)",
                rusqlite::params![
                    msg.id,
                    msg.send_time,
                    msg.content.clone().unwrap_or_default(),
                    msg.conversation_id,
                ],
            )
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        }
        Ok(rows.len())
    })
    .map_err(|e| e.to_string())
}

/// 解析 `{type}_{targetId}` 形式的 conversation_id。
///
/// - type: 0=friend, 1=group, 2=channel
/// - targetId: 对端 uid / 群 id / 频道 id
fn parse_conversation_id(conversation_id: &str) -> Result<(i32, String), String> {
    let (ty, target) = conversation_id
        .split_once('_')
        .ok_or_else(|| format!("invalid conversation_id '{}'", conversation_id))?;
    let ty: i32 = ty
        .parse()
        .map_err(|_| format!("invalid conv type in '{}'", conversation_id))?;
    Ok((ty, target.to_string()))
}

#[tauri::command]
pub async fn send_message(
    db: State<'_, DbManager>,
    ws_mgr: State<'_, WsManager>,
    crypto: State<'_, CryptoEngine>,
    uid: String,
    request: SendMessageRequest,
) -> Result<models::Message, String> {
    let (conv_type, target_id) = parse_conversation_id(&request.conversation_id)?;

    // 对齐老 im：flag/customMsgId 由前端生成并贯穿本地消息 + 10201 + 20201 回执匹配。
    // 若前端未传，才退回本地毫秒时间戳。
    let now = chrono::Utc::now().timestamp_millis();
    let client_flag = request
        .custom_msg_id
        .as_deref()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(now);
    let msg_id = client_flag.to_string();

    // 先按 "sending" 状态入库（老 im UI 是乐观追加，之后靠 20201 回执更新）。
    let message = models::Message {
        id: msg_id.clone(),
        custom_msg_id: Some(msg_id.clone()),
        conversation_id: request.conversation_id.clone(),
        sender_id: uid.clone(),
        msg_type: request.msg_type,
        content: Some(request.content.clone()),
        send_time: now,
        status: 0, // sending
        read_status: 0,
        version: 0,
        is_deleted: false,
        extra: request.extra.map(|e| e.to_string()),
    };
    db.with_connection(&uid, |conn| queries::insert_message(conn, &message))
        .map_err(|e| e.to_string())?;

    // 按会话类型分流，目前只有群文本走 WS。其余类型先只落本地（行为与之前一致），
    // 等好友 / 频道 / 非文本分片链路补齐后再开。
    match (conv_type, request.msg_type) {
        (1, 0) => {
            if let Err(e) = pipeline::send_group_text(
                &ws_mgr,
                &crypto,
                &target_id,
                &uid,
                &request.content,
                now,
                client_flag,
                Vec::new(),
            ) {
                error!(
                    "send_group_text failed conversation={} err={}",
                    request.conversation_id, e
                );
                // 标记成发送失败（-1），让 UI 显示重发按钮。
                let failed_id = msg_id.clone();
                let _ = db.with_connection(&uid, |conn| {
                    conn.execute(
                        "UPDATE messages SET status = -1 WHERE id = ?1",
                        rusqlite::params![failed_id],
                    )
                    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
                    Ok(())
                });
                return Err(e.to_string());
            }
        }
        (1, _) => {
            warn!(
                "group non-text message (type={}) send not implemented yet; kept local only",
                request.msg_type
            );
        }
        (0, _) | (2, _) => {
            warn!(
                "friend/channel send via WS not implemented yet (conv_type={}); kept local only",
                conv_type
            );
        }
        _ => {
            warn!("unknown conv_type {} - kept local only", conv_type);
        }
    }

    Ok(message)
}

/// 调试 / 过渡期用：直接把一条群 relKey 注入 `CryptoEngine` 缓存，
/// 供 [`send_message`] 调用 [`pipeline::send_group_text`] 时取用。
///
/// 正式实现应走 HTTP GetKeyPair + curve25519 派生；当前先用这条命令
/// 让群发消息的 WS 链路可以端到端打通。
#[tauri::command]
pub fn cache_group_rel_key(
    crypto: State<'_, CryptoEngine>,
    group_id: String,
    rel_key: String,
) -> Result<(), String> {
    if rel_key.len() < 16 {
        return Err(format!(
            "rel_key too short ({}), need >= 16 chars for AES-128-ECB",
            rel_key.len()
        ));
    }
    crypto.set_group_key(&group_id, rel_key);
    Ok(())
}

#[tauri::command]
pub fn has_group_rel_key(crypto: State<'_, CryptoEngine>, group_id: String) -> bool {
    crypto.get_group_key(&group_id).is_some()
}

#[tauri::command]
pub fn has_friend_rel_key(
    crypto: State<'_, CryptoEngine>,
    friend_id: String,
    version: Option<i64>,
    source: Option<String>,
) -> bool {
    if let (Some(v), Some(s)) = (version, source.as_deref()) {
        return crypto.get_friend_key(&friend_id, v, s).is_some();
    }
    crypto.has_any_friend_key(&friend_id)
}

/// 把服务端下发的群消息 publicKey/msgKey（hex 字符串）与本地 curve25519
/// 私钥做 Diffie-Hellman，派生 relKey 并缓存到 `CryptoEngine`。
///
/// 使用前必须已经通过 `set_curve_private_key_hex` 注入过当前用户的 curve25519
/// 私钥（hex），否则会报 `CryptoError::KeyNotFound`。
///
/// 对应老 im `e2ee/index.js::fnGroupRelKeyGet` 的"已拿到 keyInfos 之后"那段。
#[tauri::command]
pub fn derive_group_rel_key(
    crypto: State<'_, CryptoEngine>,
    group_id: String,
    public_key_hex: String,
    encrypted_msg_key_hex: String,
) -> Result<String, String> {
    let priv_present = crypto.get_curve_private_key().is_some();
    tracing::info!(
        target: "e2ee",
        "derive_group_rel_key start group_id={} pubkey_hex_len={} pubkey_head={} msgkey_hex_len={} msgkey_head={} own_priv_set={}",
        group_id,
        public_key_hex.len(),
        safe_head(&public_key_hex, 16),
        encrypted_msg_key_hex.len(),
        safe_head(&encrypted_msg_key_hex, 16),
        priv_present,
    );

    let encrypted_msg_key = hex::decode(&encrypted_msg_key_hex).map_err(|e| {
        tracing::error!(target: "e2ee", "derive_group_rel_key: msgKey hex decode failed: {}", e);
        format!("invalid msgKey hex: {}", e)
    })?;

    match crypto.derive_group_key(&group_id, &public_key_hex, &encrypted_msg_key) {
        Ok(rel) => {
            tracing::info!(
                target: "e2ee",
                "derive_group_rel_key OK group_id={} relkey_len={} relkey_head={}",
                group_id,
                rel.len(),
                safe_head(&rel, 8)
            );
            Ok(rel)
        }
        Err(e) => {
            tracing::error!(
                target: "e2ee",
                "derive_group_rel_key FAILED group_id={} err={} encrypted_msgkey_bytes={}",
                group_id,
                e,
                encrypted_msg_key.len()
            );
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn derive_friend_rel_key(
    crypto: State<'_, CryptoEngine>,
    friend_id: String,
    public_key_hex: String,
    encrypted_msg_key_hex: String,
    version: Option<i64>,
    source: Option<String>,
) -> Result<String, String> {
    let encrypted_msg_key = hex::decode(&encrypted_msg_key_hex)
        .map_err(|e| format!("invalid msgKey hex: {}", e))?;
    let ver = version.unwrap_or(1);
    let src = source.unwrap_or_else(|| "web".to_string());
    match crypto.derive_friend_key(
        &friend_id,
        ver,
        &src,
        &public_key_hex,
        &encrypted_msg_key,
    ) {
        Ok(rel) => Ok(rel),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn decrypt_private_incoming(
    crypto: State<'_, CryptoEngine>,
    sender_id: String,
    peer_id: Option<String>,
    version: Option<i64>,
    ciphertext_hex: String,
) -> Result<String, String> {
    let data = hex::decode(&ciphertext_hex).map_err(|e| format!("invalid ciphertext hex: {}", e))?;
    let ver = version.unwrap_or(1);
    let mut candidates = vec![sender_id];
    if let Some(pid) = peer_id {
        if !pid.is_empty() && !candidates.iter().any(|x| x == &pid) {
            candidates.push(pid);
        }
    }
    let mut plain: Option<Vec<u8>> = None;
    let mut last_err: Option<String> = None;
    for friend_id in &candidates {
        match crypto
            .decrypt_friend_message(friend_id, ver, "web", &data)
            .or_else(|_| crypto.decrypt_friend_message(friend_id, ver, "app", &data))
            .or_else(|_| {
                let key = crypto
                    .get_latest_friend_key(friend_id, "web")
                    .or_else(|| crypto.get_latest_friend_key(friend_id, "app"))
                    .ok_or(crate::crypto::CryptoError::KeyNotFound)?;
                crate::crypto::aes::decrypt_message(&data, &key)
            }) {
            Ok(v) => {
                plain = Some(v);
                break;
            }
            Err(e) => last_err = Some(e.to_string()),
        }
    }
    let plain = plain.ok_or_else(|| last_err.unwrap_or_else(|| "decrypt failed".to_string()))?;
    if let Ok(obj) = crate::proto::imweb::TextObj::decode(plain.as_slice()) {
        return Ok(obj.content);
    }
    String::from_utf8(plain).map_err(|e| format!("utf8 decode failed: {}", e))
}

#[tauri::command]
pub fn decrypt_group_incoming(
    crypto: State<'_, CryptoEngine>,
    group_id: String,
    ciphertext_hex: String,
) -> Result<String, String> {
    let data = hex::decode(&ciphertext_hex).map_err(|e| format!("invalid ciphertext hex: {}", e))?;
    let plain = crypto
        .decrypt_group_message(&group_id, &data)
        .map_err(|e| e.to_string())?;
    if let Ok(obj) = crate::proto::imweb::TextObj::decode(plain.as_slice()) {
        return Ok(obj.content);
    }
    String::from_utf8(plain).map_err(|e| format!("utf8 decode failed: {}", e))
}

fn safe_head(s: &str, n: usize) -> String {
    let take = s.chars().take(n).collect::<String>();
    if s.chars().count() > n {
        format!("{}…", take)
    } else {
        take
    }
}

#[tauri::command]
pub fn set_curve_private_key_hex(
    crypto: State<'_, CryptoEngine>,
    private_key_hex: String,
) -> Result<(), String> {
    if private_key_hex.trim().is_empty() {
        return Err("empty curve25519 private key".to_string());
    }
    crypto.set_curve_private_key(private_key_hex);
    Ok(())
}

/// 生成一对新的 curve25519 密钥（与老 im `setGenerateKeyPair()` 等价），
/// 返回 HEX 大写字符串。前端拿到后会走 `UpdateKeyPair` 上报 `publicKey`，
/// 同时把 `privateKey` 存在账户本地，再反过来通过
/// [`set_curve_private_key_hex`] 注入到 `CryptoEngine`。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedCurveKeyPair {
    pub private_key_hex: String,
    pub public_key_hex: String,
}

#[tauri::command]
pub fn generate_curve25519_keypair() -> GeneratedCurveKeyPair {
    let (priv_hex, pub_hex) = crate::crypto::curve25519::generate_keypair_hex();
    GeneratedCurveKeyPair {
        private_key_hex: priv_hex.to_uppercase(),
        public_key_hex: pub_hex.to_uppercase(),
    }
}

/// 20201 回执持久化：收到服务端回执后，前端会拿着 `{flag, msgId, sentOverTime}`
/// 调这条命令；这里把本地 `Message` 行从 `status=0 (sending)` 升级为
/// `status=1 (sent)` 并用服务端 msgId 覆盖本地 id（与老 im 行为一致）。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkMessageSentRequest {
    pub conversation_id: String,
    /// 本地 `custom_msg_id` / `id`，与 WS `flag` 一一对应。
    pub custom_msg_id: String,
    /// 服务端真实 msg id（`SendGroupMessageResp.msg_id`）。
    pub server_msg_id: i64,
    /// 服务端发送完成时间（毫秒）。
    pub sent_over_time: Option<i64>,
}

#[tauri::command]
pub async fn mark_message_sent(
    db: State<'_, DbManager>,
    uid: String,
    request: MarkMessageSentRequest,
) -> Result<(), String> {
    let server_id = request.server_msg_id.to_string();
    let sent_time = request.sent_over_time.unwrap_or(0);

    db.with_connection(&uid, |conn| {
        // 两步：① 用服务端 msg_id 替换本地 id（与老 im `updateMsgProperty` 逻辑一致）；
        //     ② 同一行状态置为 1（sent），send_time 更新为服务端返回的完成时间。
        if sent_time > 0 {
            conn.execute(
                "UPDATE messages SET id = ?1, status = 1, send_time = ?2
                 WHERE custom_msg_id = ?3 AND conversation_id = ?4",
                rusqlite::params![
                    server_id,
                    sent_time,
                    request.custom_msg_id,
                    request.conversation_id,
                ],
            )
        } else {
            conn.execute(
                "UPDATE messages SET id = ?1, status = 1
                 WHERE custom_msg_id = ?2 AND conversation_id = ?3",
                rusqlite::params![server_id, request.custom_msg_id, request.conversation_id],
            )
        }
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

        // 同步会话 last_msg_id → 服务端 id，避免"发送成功后点进去重新加载消息"
        // 出现一条重复的本地占位记录。
        conn.execute(
            "UPDATE conversations SET last_msg_id = ?1 WHERE id = ?2 AND last_msg_id = ?3",
            rusqlite::params![server_id, request.conversation_id, request.custom_msg_id],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        Ok(())
    })
    .map_err(|e| e.to_string())
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
