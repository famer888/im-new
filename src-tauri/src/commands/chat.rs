use std::collections::{HashMap, HashSet};

use prost::Message as _;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tracing::{error, warn};

use crate::crypto::CryptoEngine;
use crate::db::{models, queries, DbManager};
use crate::messaging::pipeline;
use crate::proto::imweb;
use crate::ws::{commands as ws_cmds, WsManager};

#[derive(Debug, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub conversation_id: String,
    pub msg_type: i32,
    pub content: String,
    pub extra: Option<serde_json::Value>,
    pub snapchat_time: Option<i32>,
    /// 前端生成的 customMsgId（对齐老 im 的 flag）。
    pub custom_msg_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearConversationHistoryRequest {
    pub conversation_id: String,
    pub remote: Option<bool>,
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
        if conversation_id == "1_invitation" {
            cleanup_all_group_notification_duplicates(conn)?;
        }
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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledDeletion {
    pub conversation_id: String,
    pub message_id: String,
    pub expire_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReadProcessingResult {
    pub read_message_ids: Vec<String>,
    pub local_read_message_ids: Vec<String>,
    pub scheduled_deletions: Vec<ScheduledDeletion>,
    pub group_read_updates: Vec<GroupReadReceiptUpdate>,
    pub conversation_read_updates: Vec<ConversationReadUpdate>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReadReceiptSyncPayload {
    pub msg_id: i64,
    pub send_uid: i64,
    pub target_id: i64,
    pub status: i32,
    pub read_time: i64,
    pub snapchat_time: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GroupReadReceiptSyncPayload {
    pub msg_id: i64,
    pub group_id: i64,
    pub send_uid: i64,
    pub status: i32,
    pub read_time: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GroupReadReceiptUpdate {
    pub conversation_id: String,
    pub message_id: String,
    pub read_status: i32,
    pub extra: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConversationReadUpdate {
    pub conversation_id: String,
    pub unread_count: i32,
}

#[derive(Debug)]
struct ReadCandidate {
    id: String,
    sender_id: String,
    msg_type: i32,
    delete_delay_ms: i64,
    snapchat_time: i32,
    extra: Option<String>,
}

fn message_digest(msg_type: i32, content: Option<&str>) -> String {
    match msg_type {
        1 => "[图片]".to_string(),
        9 => "[动画表情]".to_string(),
        2 => "[语音]".to_string(),
        3 => "[视频]".to_string(),
        5 => "[名片]".to_string(),
        7 => "[文件]".to_string(),
        12 => "[骰子]".to_string(),
        18 => "[扑克牌]".to_string(),
        10 | 13 | 14 | 15 => "暂不支持该消息类型".to_string(),
        _ => content
            .unwrap_or_default()
            .trim()
            .chars()
            .take(200)
            .collect(),
    }
}

fn dice_result_from_content(content: Option<&str>) -> Option<i32> {
    let raw = content?.trim();
    if raw.is_empty() {
        return None;
    }

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) {
        if let Some(value) = value
            .as_i64()
            .or_else(|| value.as_str().and_then(|s| s.trim().parse::<i64>().ok()))
        {
            if (1..=6).contains(&value) {
                return Some(value as i32);
            }
        }

        for key in ["currentImage", "current_image", "result", "value"] {
            let Some(value) = value.get(key).and_then(|v| {
                v.as_i64()
                    .or_else(|| v.as_str().and_then(|s| s.trim().parse::<i64>().ok()))
            }) else {
                continue;
            };
            if (1..=6).contains(&value) {
                return Some(value as i32);
            }
        }
        return None;
    }

    let value = raw
        .split("||")
        .next()
        .and_then(|value| value.trim().parse::<i64>().ok())?;
    if (1..=6).contains(&value) {
        Some(value as i32)
    } else {
        None
    }
}

fn name_card_obj_to_legacy_content(obj: imweb::NameCardObj) -> String {
    if obj.icon.is_empty() {
        format!("{}*|*|*{}", obj.nick_name, obj.uid)
    } else {
        format!("{}*|*|*{}*|*|*{}", obj.nick_name, obj.icon, obj.uid)
    }
}

/// 入站消息落库（用于 WS 推送消息的本地历史持久化）。
///
/// 对齐列表未读角标：对「入库前不存在」且「发送者不是当前账号」的消息递增 `unread_count`，
/// 并向各前端窗口 `emit("conv:update", …)`（此前仅落库未推会话，角标恒为 0）。
#[tauri::command]
pub async fn upsert_incoming_messages(
    app: AppHandle,
    db: State<'_, DbManager>,
    uid: String,
    messages: Vec<IncomingMessagePayload>,
) -> Result<usize, String> {
    if messages.is_empty() {
        return Ok(0);
    }

    let uid_trim = uid.trim().to_string();

    let (count, conv_ids_to_emit) = db
        .with_connection(&uid_trim, |conn| {
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
            rows = dedupe_incoming_group_notification_rows(rows);

            if rows.is_empty() {
                return Ok((0usize, Vec::<String>::new()));
            }

            // 未读：INSERT OR REPLACE 前检查是否为新 id；同批重复 id 只计一次
            let mut unread_delta: HashMap<String, i32> = HashMap::new();
            let mut notification_unread_counts: HashMap<String, i32> = HashMap::new();
            let mut seen_ids_for_unread = HashSet::<String>::new();
            for msg in &rows {
                if !seen_ids_for_unread.insert(msg.id.clone()) {
                    continue;
                }
                let existing_send_time = conn
                    .query_row(
                        "SELECT send_time FROM messages WHERE id = ?1",
                        rusqlite::params![&msg.id],
                        |row| row.get::<_, i64>(0),
                    )
                    .optional()
                    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
                if msg.conversation_id == "1_invitation" && msg.msg_type == 8 {
                    if existing_send_time
                        .map(|time| msg.send_time > time)
                        .unwrap_or(true)
                    {
                        let count = notification_unread_count(msg).unwrap_or(1).max(1);
                        notification_unread_counts.insert(msg.conversation_id.clone(), count);
                    }
                    continue;
                }
                if existing_send_time.is_some() {
                    continue;
                }
                if let Some(count) = notification_unread_count(msg) {
                    notification_unread_counts.insert(msg.conversation_id.clone(), count);
                    continue;
                }
                if should_count_as_unread(msg, &uid_trim) {
                    *unread_delta.entry(msg.conversation_id.clone()).or_insert(0) += 1;
                }
            }

            delete_existing_group_notification_duplicates(conn, &rows)?;
            queries::batch_insert_messages(conn, &rows)?;

            for msg in &rows {
                let (conv_type, target_id) =
                    parse_conversation_id(&msg.conversation_id).unwrap_or((0, String::new()));
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
                        message_digest(msg.msg_type, msg.content.as_deref()),
                        msg.conversation_id,
                    ],
                )
                .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
            }

            for (conv_id, delta) in unread_delta {
                if delta > 0 {
                    conn.execute(
                        "UPDATE conversations SET unread_count = unread_count + ?1 WHERE id = ?2",
                        rusqlite::params![delta, conv_id],
                    )
                    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
                }
            }

            for (conv_id, count) in notification_unread_counts {
                conn.execute(
                    "UPDATE conversations SET unread_count = ?1 WHERE id = ?2",
                    rusqlite::params![count, conv_id],
                )
                .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
            }

            let mut seen_conv = HashSet::<String>::new();
            let mut conv_ids_to_emit = Vec::<String>::new();
            for msg in &rows {
                if seen_conv.insert(msg.conversation_id.clone()) {
                    conv_ids_to_emit.push(msg.conversation_id.clone());
                }
            }

            Ok((rows.len(), conv_ids_to_emit))
        })
        .map_err(|e| e.to_string())?;

    for conv_id in conv_ids_to_emit {
        if let Ok(Some(conv)) = db.with_connection(&uid_trim, |conn| {
            queries::get_conversation_by_id(conn, &conv_id)
        }) {
            let _ = app.emit("conv:update", &conv);
        }
    }

    Ok(count)
}

#[tauri::command]
pub async fn send_group_event_receipt(
    ws_mgr: State<'_, WsManager>,
    group_id: i64,
    receipt_status: i32,
    msg_type: i32,
    msg_ids: Vec<i64>,
) -> Result<(), String> {
    if group_id <= 0 {
        return Err("invalid group_id".to_string());
    }

    let msg_id = msg_ids.into_iter().filter(|id| *id > 0).collect::<Vec<_>>();
    if msg_id.is_empty() {
        return Err("empty group event msg_ids".to_string());
    }

    let req = imweb::ReceiveGroupEventReceiptMessage {
        group_id,
        receipt_status,
        msg_type,
        msg_id,
    };
    ws_mgr
        .send_packet(
            ws_cmds::GROUP_EVENT_RECEIPT,
            ws_cmds::GROUP_EVENT_RECEIPT as i64,
            &req.encode_to_vec(),
        )
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

fn extract_read_burn_meta(extra: Option<&str>) -> (i32, i64) {
    let Some(raw) = extra else {
        return (0, 0);
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else {
        return (0, 0);
    };
    let Some(obj) = value.as_object() else {
        return (0, 0);
    };

    let mut snapchat_time = obj
        .get("snapchatTime")
        .or_else(|| obj.get("snapchat_time"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let mut delete_delay_ms = obj
        .get("deleteSeconds")
        .or_else(|| obj.get("delete_seconds"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    if delete_delay_ms <= 0 && snapchat_time > 0 {
        delete_delay_ms = snapchat_time * 1000;
    }
    if snapchat_time <= 0 && delete_delay_ms > 0 {
        snapchat_time = delete_delay_ms / 1000;
    }

    (snapchat_time.max(0) as i32, delete_delay_ms.max(0))
}

fn normalize_external_timestamp(ts: i64, fallback: i64) -> i64 {
    if ts <= 0 {
        return fallback;
    }
    if ts < 10_000_000_000 {
        ts * 1000
    } else {
        ts
    }
}

fn should_count_as_unread(msg: &models::Message, uid: &str) -> bool {
    // 对齐旧 im：阅后即焚配置变更等通知消息是 chatType=51，不进入
    // “未读正文”计数；新项目用 msgType=6/8 承载这类系统提示。
    msg.sender_id != uid && !matches!(msg.msg_type, 6 | 8)
}

fn dedupe_incoming_group_notification_rows(rows: Vec<models::Message>) -> Vec<models::Message> {
    let mut deduped = Vec::<models::Message>::with_capacity(rows.len());
    let mut identity_index = HashMap::<String, usize>::new();

    for row in rows {
        let Some(identity) = group_notification_identity(&row) else {
            deduped.push(row);
            continue;
        };

        if let Some(index) = identity_index.get(&identity).copied() {
            if row.send_time >= deduped[index].send_time {
                deduped[index] = row;
            }
        } else {
            identity_index.insert(identity, deduped.len());
            deduped.push(row);
        }
    }

    deduped
}

fn delete_existing_group_notification_duplicates(
    conn: &rusqlite::Connection,
    rows: &[models::Message],
) -> Result<(), crate::db::DbError> {
    let incoming = rows
        .iter()
        .filter_map(|msg| {
            group_notification_identity(msg).map(|identity| (identity, msg.id.clone()))
        })
        .collect::<HashMap<_, _>>();
    if incoming.is_empty() {
        return Ok(());
    }

    let mut stmt = conn
        .prepare_cached(
            "SELECT id, extra
             FROM messages
             WHERE conversation_id = '1_invitation'
               AND msg_type = 8
               AND is_deleted = 0",
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

    let mut delete_ids = Vec::<String>::new();
    for row in rows {
        let (id, extra) = row.map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        let Some(identity) = group_notification_identity_from_extra(extra.as_deref(), None) else {
            continue;
        };
        let Some(keep_id) = incoming.get(&identity) else {
            continue;
        };
        if &id != keep_id {
            delete_ids.push(id);
        }
    }

    if delete_ids.is_empty() {
        return Ok(());
    }

    let mut stmt = conn
        .prepare_cached("DELETE FROM messages WHERE id = ?1")
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
    for id in &delete_ids {
        stmt.execute(rusqlite::params![id])
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
    }
    warn!(
        target: "group-notification",
        "deduped existing group notification messages count={}",
        delete_ids.len()
    );
    Ok(())
}

fn cleanup_all_group_notification_duplicates(
    conn: &rusqlite::Connection,
) -> Result<(), crate::db::DbError> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT id, send_time, extra
             FROM messages
             WHERE conversation_id = '1_invitation'
               AND msg_type = 8
               AND is_deleted = 0",
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

    let mut keep_by_identity = HashMap::<String, (String, i64)>::new();
    let mut delete_ids = Vec::<String>::new();
    for row in rows {
        let (id, send_time, extra) =
            row.map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        let Some(identity) = group_notification_identity_from_extra(extra.as_deref(), None) else {
            continue;
        };
        if let Some((keep_id, keep_time)) = keep_by_identity.get_mut(&identity) {
            if send_time >= *keep_time {
                delete_ids.push(keep_id.clone());
                *keep_id = id;
                *keep_time = send_time;
            } else {
                delete_ids.push(id);
            }
        } else {
            keep_by_identity.insert(identity, (id, send_time));
        }
    }

    if delete_ids.is_empty() {
        return Ok(());
    }

    let mut stmt = conn
        .prepare_cached("DELETE FROM messages WHERE id = ?1")
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
    for id in &delete_ids {
        stmt.execute(rusqlite::params![id])
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
    }
    warn!(
        target: "group-notification",
        "cleaned stored group notification duplicates count={}",
        delete_ids.len()
    );
    Ok(())
}

fn group_notification_identity(msg: &models::Message) -> Option<String> {
    if msg.conversation_id != "1_invitation" || msg.msg_type != 8 {
        return None;
    }
    group_notification_identity_from_extra(msg.extra.as_deref(), Some(&msg.sender_id))
}

fn group_notification_identity_from_extra(
    raw: Option<&str>,
    sender_id: Option<&str>,
) -> Option<String> {
    let value = serde_json::from_str::<serde_json::Value>(raw?).ok()?;
    let object = match value {
        serde_json::Value::Object(map) => serde_json::Value::Object(map),
        serde_json::Value::String(raw) => serde_json::from_str::<serde_json::Value>(&raw).ok()?,
        _ => return None,
    };

    let group_id = json_string_field(&object, &["groupId", "group_id"])?;
    let req_type = json_string_field(&object, &["groupReqType", "group_req_type"])?;
    let send_uid = json_string_field(&object, &["sendUid", "send_uid", "fromUid", "from_uid"])
        .or_else(|| sender_id.map(|value| value.trim().to_string()))
        .filter(|value| !value.is_empty())?;
    let receive_uid = json_string_field(&object, &["receiveUid", "receive_uid"])
        .or_else(|| json_user_id_field(&object, "targetUser"))
        .or_else(|| json_user_id_field(&object, "checkUser"))
        .unwrap_or_default();

    Some(format!(
        "group-req-notice:{}:{}:{}:{}",
        group_id, req_type, send_uid, receive_uid,
    ))
}

fn json_string_field(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    keys.iter()
        .find_map(|key| object.get(*key))
        .and_then(json_scalar_to_string)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn json_user_id_field(value: &serde_json::Value, key: &str) -> Option<String> {
    let user = value.as_object()?.get(key)?;
    json_string_field(user, &["uid", "userId", "user_id"])
}

fn json_scalar_to_string(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(value) => Some(value.clone()),
        serde_json::Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn notification_unread_count(msg: &models::Message) -> Option<i32> {
    if msg.conversation_id != "1_invitation" && msg.conversation_id != "0_channelNotice" {
        return None;
    }

    let value = serde_json::from_str::<serde_json::Value>(msg.extra.as_deref()?).ok()?;
    let object = match value {
        serde_json::Value::Object(map) => serde_json::Value::Object(map),
        serde_json::Value::String(raw) => serde_json::from_str::<serde_json::Value>(&raw).ok()?,
        _ => return None,
    };

    let count = object
        .get("unReadNum")
        .or_else(|| object.get("unreadCount"))
        .or_else(|| object.get("unread_count"))
        .or_else(|| object.get("un_read_num"))
        .and_then(|v| {
            v.as_i64()
                .or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok()))
        })?;

    Some(count.clamp(0, i32::MAX as i64) as i32)
}

fn parse_extra_map(extra: Option<&str>) -> serde_json::Map<String, serde_json::Value> {
    let Some(raw) = extra else {
        return serde_json::Map::new();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else {
        return serde_json::Map::new();
    };
    match value {
        serde_json::Value::Object(map) => map,
        _ => serde_json::Map::new(),
    }
}

fn read_user_id(value: &serde_json::Value) -> Option<i64> {
    value.get("userId").and_then(|v| {
        v.as_i64()
            .or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok()))
    })
}

#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    db: State<'_, DbManager>,
    ws_mgr: State<'_, WsManager>,
    crypto: State<'_, CryptoEngine>,
    uid: String,
    request: SendMessageRequest,
) -> Result<models::Message, String> {
    let (conv_type, target_id) = parse_conversation_id(&request.conversation_id)?;
    let snapchat_time = request.snapchat_time.unwrap_or(0).max(0);

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
    let mut extra_value = request.extra.unwrap_or(serde_json::Value::Null);
    if snapchat_time > 0 {
        let mut map = match extra_value {
            serde_json::Value::Object(map) => map,
            serde_json::Value::Null => serde_json::Map::new(),
            other => {
                let mut map = serde_json::Map::new();
                map.insert("payload".to_string(), other);
                map
            }
        };
        map.entry("snapchatTime".to_string())
            .or_insert(serde_json::Value::from(snapchat_time));
        map.entry("deleteSeconds".to_string())
            .or_insert(serde_json::Value::from(i64::from(snapchat_time) * 1000));
        extra_value = serde_json::Value::Object(map);
    }
    let extra_json = match extra_value {
        serde_json::Value::Null => None,
        value => Some(value.to_string()),
    };

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
        extra: extra_json,
    };
    db.with_connection(&uid, |conn| {
        queries::insert_message(conn, &message)?;
        conn.execute(
            "INSERT OR IGNORE INTO conversations (id, type, target_id, updated_at)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![&request.conversation_id, conv_type, &target_id, now],
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
                &msg_id,
                now,
                message_digest(request.msg_type, Some(&request.content)),
                &request.conversation_id,
            ],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        Ok(())
    })
    .map_err(|e| e.to_string())?;
    let _ = app.emit("msg:local-sent", &message);

    let mark_failed_and_return = |reason: String| -> Result<models::Message, String> {
        let failed_id = msg_id.clone();
        let _ = db.with_connection(&uid, |conn| {
            conn.execute(
                "UPDATE messages SET status = -1 WHERE id = ?1",
                rusqlite::params![failed_id],
            )
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
            Ok(())
        });
        Err(reason)
    };

    // 按会话类型分流。文本、图片、语音、视频、文件走 WS 发送链路；单聊额外打通名片转发；
    // 骰子暂开放单聊和群聊。
    // 其余未实现类型先保持原来的
    // “仅落本地”行为，避免误伤其它模块。
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
        (0, 0) => {
            if let Err(e) = pipeline::send_private_text(
                &ws_mgr,
                &crypto,
                &target_id,
                &uid,
                &request.content,
                now,
                client_flag,
                snapchat_time,
            ) {
                error!(
                    "send_private_text failed conversation={} err={}",
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
        (2, 0) => {
            if let Err(e) = pipeline::send_channel_text(
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
                    "send_channel_text failed conversation={} err={}",
                    request.conversation_id, e
                );
                return mark_failed_and_return(e.to_string());
            }
        }
        (1, 1) | (1, 2) | (1, 3) | (1, 7) | (1, 9) | (1, 12) | (1, 18) => {
            if let Err(e) = pipeline::send_group_message(
                &ws_mgr,
                &crypto,
                &target_id,
                &uid,
                request.msg_type,
                &request.content,
                now,
                client_flag,
                Vec::new(),
            ) {
                error!(
                    "send_group_message failed conversation={} msg_type={} err={}",
                    request.conversation_id, request.msg_type, e
                );
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
        (0, 1) | (0, 2) | (0, 3) | (0, 5) | (0, 7) | (0, 9) | (0, 12) | (0, 18) => {
            if let Err(e) = pipeline::send_private_message(
                &ws_mgr,
                &crypto,
                &target_id,
                &uid,
                request.msg_type,
                &request.content,
                now,
                client_flag,
                snapchat_time,
            ) {
                error!(
                    "send_private_message failed conversation={} msg_type={} err={}",
                    request.conversation_id, request.msg_type, e
                );
                return mark_failed_and_return(e.to_string());
            }
        }
        (2, 1) | (2, 2) | (2, 3) | (2, 7) | (2, 9) => {
            if let Err(e) = pipeline::send_channel_message(
                &ws_mgr,
                &crypto,
                &target_id,
                &uid,
                request.msg_type,
                &request.content,
                now,
                client_flag,
                Vec::new(),
            ) {
                error!(
                    "send_channel_message failed conversation={} msg_type={} err={}",
                    request.conversation_id, request.msg_type, e
                );
                return mark_failed_and_return(e.to_string());
            }
        }
        (2, 12) => {
            return mark_failed_and_return(
                "dice message is only supported in friend and group chats".to_string(),
            );
        }
        (1, _) => {
            warn!(
                "group non-text message (type={}) send not implemented yet; kept local only",
                request.msg_type
            );
        }
        (0, _) => {
            warn!(
                "friend send via WS not implemented yet (conv_type={}); kept local only",
                conv_type
            );
        }
        (2, _) => {
            warn!(
                "channel non-text message (type={}) send not implemented yet; kept local only",
                request.msg_type
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
pub fn has_channel_rel_key(crypto: State<'_, CryptoEngine>, channel_id: String) -> bool {
    crypto.get_channel_key(&channel_id).is_some()
}

/// 从 CryptoEngine 移除指定群的 relKey 缓存。用于"收到一条群消息但
/// 解密失败（key 可能已轮换）"时强制下一次 `ensureGroupRelKey` 走
/// 服务端 `GetKeyPair` 重新派生。与老 im
/// `fnMsgDecryption` 在 `_decrypt` 抛错后 `delete groupKeyObjs[id]`
/// 的语义一致。
#[tauri::command]
pub fn clear_group_rel_key(
    crypto: State<'_, CryptoEngine>,
    group_id: String,
) -> Result<(), String> {
    crypto.remove_group_key(&group_id);
    tracing::info!(target: "e2ee", "clear_group_rel_key group_id={}", group_id);
    Ok(())
}

#[tauri::command]
pub fn clear_channel_rel_key(
    crypto: State<'_, CryptoEngine>,
    channel_id: String,
) -> Result<(), String> {
    crypto.remove_channel_key(&channel_id);
    tracing::info!(target: "e2ee", "clear_channel_rel_key channel_id={}", channel_id);
    Ok(())
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
pub fn derive_channel_rel_key(
    crypto: State<'_, CryptoEngine>,
    channel_id: String,
    public_key_hex: String,
    encrypted_msg_key_hex: String,
) -> Result<String, String> {
    let priv_present = crypto.get_curve_private_key().is_some();
    tracing::info!(
        target: "e2ee",
        "derive_channel_rel_key start channel_id={} pubkey_hex_len={} pubkey_head={} msgkey_hex_len={} msgkey_head={} own_priv_set={}",
        channel_id,
        public_key_hex.len(),
        safe_head(&public_key_hex, 16),
        encrypted_msg_key_hex.len(),
        safe_head(&encrypted_msg_key_hex, 16),
        priv_present,
    );

    let encrypted_msg_key = hex::decode(&encrypted_msg_key_hex).map_err(|e| {
        tracing::error!(target: "e2ee", "derive_channel_rel_key: msgKey hex decode failed: {}", e);
        format!("invalid msgKey hex: {}", e)
    })?;

    match crypto.derive_channel_key(&channel_id, &public_key_hex, &encrypted_msg_key) {
        Ok(rel) => {
            tracing::info!(
                target: "e2ee",
                "derive_channel_rel_key OK channel_id={} relkey_len={} relkey_head={}",
                channel_id,
                rel.len(),
                safe_head(&rel, 8)
            );
            Ok(rel)
        }
        Err(e) => {
            tracing::error!(
                target: "e2ee",
                "derive_channel_rel_key FAILED channel_id={} err={} encrypted_msgkey_bytes={}",
                channel_id,
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
    let encrypted_msg_key =
        hex::decode(&encrypted_msg_key_hex).map_err(|e| format!("invalid msgKey hex: {}", e))?;
    let ver = version.unwrap_or(1);
    let src = source.unwrap_or_else(|| "web".to_string());
    match crypto.derive_friend_key(&friend_id, ver, &src, &public_key_hex, &encrypted_msg_key) {
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
    source: Option<String>,
    ciphertext_hex: String,
    msg_type: Option<i32>,
) -> Result<String, String> {
    let data =
        hex::decode(&ciphertext_hex).map_err(|e| format!("invalid ciphertext hex: {}", e))?;
    let ver = version.unwrap_or(1);
    let mut candidates = vec![sender_id];
    if let Some(pid) = peer_id {
        if !pid.is_empty() && !candidates.iter().any(|x| x == &pid) {
            candidates.push(pid);
        }
    }
    let mut plain: Option<Vec<u8>> = None;
    let mut last_err: Option<String> = None;
    let preferred_source = source
        .as_deref()
        .map(str::trim)
        .filter(|s| *s == "web" || *s == "app");
    for friend_id in &candidates {
        let decrypted = if let Some(src) = preferred_source {
            crypto
                .decrypt_friend_message(friend_id, ver, src, &data)
                .or_else(|_| {
                    let key = crypto
                        .get_latest_friend_key(friend_id, src)
                        .ok_or(crate::crypto::CryptoError::KeyNotFound)?;
                    crate::crypto::aes::decrypt_message(&data, &key)
                })
        } else {
            crypto
                .decrypt_friend_message(friend_id, ver, "web", &data)
                .or_else(|_| crypto.decrypt_friend_message(friend_id, ver, "app", &data))
                .or_else(|_| {
                    let key = crypto
                        .get_latest_friend_key(friend_id, "web")
                        .or_else(|| crypto.get_latest_friend_key(friend_id, "app"))
                        .ok_or(crate::crypto::CryptoError::KeyNotFound)?;
                    crate::crypto::aes::decrypt_message(&data, &key)
                })
        };
        match decrypted {
            Ok(v) => {
                plain = Some(v);
                break;
            }
            Err(e) => last_err = Some(e.to_string()),
        }
    }
    let plain = plain.ok_or_else(|| last_err.unwrap_or_else(|| "decrypt failed".to_string()))?;
    match msg_type.unwrap_or(0) {
        1 => {
            if let Ok(obj) = crate::proto::imweb::ImageObj::decode(plain.as_slice()) {
                return Ok(serde_json::json!({
                    "url": obj.url,
                    "thumbnailUrl": obj.thumb_url,
                    "width": obj.width,
                    "height": obj.height,
                    "size": obj.file_size,
                    "sizeType": obj.size_type,
                })
                .to_string());
            }
        }
        9 => {
            if let Ok(obj) = crate::proto::imweb::DynamicImageObj::decode(plain.as_slice()) {
                return Ok(serde_json::json!({
                    "url": obj.url,
                    "gif": obj.url,
                    "thumbnailUrl": obj.thumb_url,
                    "thumbUrl": obj.thumb_url,
                    "width": obj.width,
                    "height": obj.height,
                    "size": obj.file_size,
                })
                .to_string());
            }
        }
        2 => {
            if let Ok(obj) = crate::proto::imweb::AudioObj::decode(plain.as_slice()) {
                return Ok(serde_json::json!({
                    "url": obj.url,
                    "duration": obj.duration,
                    "size": obj.file_size,
                })
                .to_string());
            }
        }
        3 => {
            if let Ok(obj) = crate::proto::imweb::VideoObj::decode(plain.as_slice()) {
                return Ok(serde_json::json!({
                    "url": obj.url,
                    "thumbUrl": obj.thumb_url,
                    "thumbnailUrl": obj.thumb_url,
                    "duration": obj.duration,
                    "width": obj.width,
                    "height": obj.height,
                    "size": obj.file_size,
                })
                .to_string());
            }
        }
        5 => {
            if let Ok(obj) = crate::proto::imweb::NameCardObj::decode(plain.as_slice()) {
                return Ok(name_card_obj_to_legacy_content(obj));
            }
        }
        _ => {}
    }
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
    msg_type: Option<i32>,
) -> Result<String, String> {
    let data =
        hex::decode(&ciphertext_hex).map_err(|e| format!("invalid ciphertext hex: {}", e))?;
    let key_cached = crypto.get_group_key(&group_id).is_some();
    let is_group_audio = msg_type.unwrap_or(0) == 2;
    if is_group_audio {
        tracing::info!(
            target: "group-audio",
            "decrypt_group_incoming request group_id={} cipher_len={} key_cached={}",
            group_id,
            data.len(),
            key_cached,
        );
    }
    match crypto.decrypt_group_message(&group_id, &data) {
        Ok(plain) => {
            tracing::info!(
                target: "e2ee",
                "decrypt_group_incoming OK group_id={} cipher_len={} plain_len={} key_cached={}",
                group_id,
                data.len(),
                plain.len(),
                key_cached,
            );
            match msg_type.unwrap_or(0) {
                1 => {
                    if let Ok(obj) = crate::proto::imweb::ImageObj::decode(plain.as_slice()) {
                        return Ok(serde_json::json!({
                            "url": obj.url,
                            "thumbnailUrl": obj.thumb_url,
                            "width": obj.width,
                            "height": obj.height,
                            "size": obj.file_size,
                            "sizeType": obj.size_type,
                        })
                        .to_string());
                    }
                }
                9 => {
                    if let Ok(obj) = crate::proto::imweb::DynamicImageObj::decode(plain.as_slice()) {
                        return Ok(serde_json::json!({
                            "url": obj.url,
                            "gif": obj.url,
                            "thumbnailUrl": obj.thumb_url,
                            "thumbUrl": obj.thumb_url,
                            "width": obj.width,
                            "height": obj.height,
                            "size": obj.file_size,
                        })
                        .to_string());
                    }
                }
                2 => {
                    if let Ok(obj) = crate::proto::imweb::AudioObj::decode(plain.as_slice()) {
                        tracing::info!(
                            target: "group-audio",
                            "decrypt_group_incoming audio decoded group_id={} plain_len={} url_head={} duration={} size={}",
                            group_id,
                            plain.len(),
                            obj.url.chars().take(120).collect::<String>(),
                            obj.duration,
                            obj.file_size,
                        );
                        return Ok(serde_json::json!({
                            "url": obj.url,
                            "duration": obj.duration,
                            "size": obj.file_size,
                        })
                        .to_string());
                    }
                }
                3 => {
                    if let Ok(obj) = crate::proto::imweb::VideoObj::decode(plain.as_slice()) {
                        return Ok(serde_json::json!({
                            "url": obj.url,
                            "thumbUrl": obj.thumb_url,
                            "thumbnailUrl": obj.thumb_url,
                            "duration": obj.duration,
                            "width": obj.width,
                            "height": obj.height,
                            "size": obj.file_size,
                        })
                        .to_string());
                    }
                }
                5 => {
                    if let Ok(obj) = crate::proto::imweb::NameCardObj::decode(plain.as_slice()) {
                        return Ok(name_card_obj_to_legacy_content(obj));
                    }
                }
                _ => {}
            }
            if let Ok(obj) = crate::proto::imweb::TextObj::decode(plain.as_slice()) {
                return Ok(obj.content);
            }
            if is_group_audio {
                tracing::warn!(
                    target: "group-audio",
                    "decrypt_group_incoming audio protobuf decode failed group_id={} plain_len={} plain_head_hex={}",
                    group_id,
                    plain.len(),
                    plain.iter().take(16).map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" "),
                );
            }
            String::from_utf8(plain).map_err(|e| format!("utf8 decode failed: {}", e))
        }
        Err(e) => {
            tracing::warn!(
                target: "e2ee",
                "decrypt_group_incoming FAILED group_id={} cipher_len={} key_cached={} err={}",
                group_id,
                data.len(),
                key_cached,
                e,
            );
            if msg_type.unwrap_or(0) == 2 {
                if let Ok(obj) = crate::proto::imweb::AudioObj::decode(data.as_slice()) {
                    tracing::info!(
                        target: "group-audio",
                        "decrypt_group_incoming raw audio decoded group_id={} raw_len={} url_head={} duration={} size={}",
                        group_id,
                        data.len(),
                        obj.url.chars().take(120).collect::<String>(),
                        obj.duration,
                        obj.file_size,
                    );
                    return Ok(serde_json::json!({
                        "url": obj.url,
                        "duration": obj.duration,
                        "size": obj.file_size,
                    })
                    .to_string());
                }
            }
            if is_group_audio {
                tracing::warn!(
                    target: "group-audio",
                    "decrypt_group_incoming audio decrypt failed group_id={} cipher_len={} key_cached={} err={}",
                    group_id,
                    data.len(),
                    key_cached,
                    e,
                );
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn decrypt_channel_incoming(
    crypto: State<'_, CryptoEngine>,
    channel_id: String,
    ciphertext_hex: String,
    msg_type: Option<i32>,
) -> Result<String, String> {
    let data =
        hex::decode(&ciphertext_hex).map_err(|e| format!("invalid ciphertext hex: {}", e))?;
    let key_cached = crypto.get_channel_key(&channel_id).is_some();
    tracing::info!(
        target: "e2ee",
        "[channel] decrypt_channel_incoming request channel_id={} cipher_len={} key_cached={}",
        channel_id,
        data.len(),
        key_cached,
    );
    match crypto.decrypt_channel_message(&channel_id, &data) {
        Ok(plain) => {
            tracing::info!(
                target: "e2ee",
                "[channel] decrypt_channel_incoming OK channel_id={} cipher_len={} plain_len={} key_cached={}",
                channel_id,
                data.len(),
                plain.len(),
                key_cached,
            );
            match msg_type.unwrap_or(0) {
                1 => {
                    if let Ok(obj) = crate::proto::imweb::ImageObj::decode(plain.as_slice()) {
                        return Ok(serde_json::json!({
                            "url": obj.url,
                            "thumbnailUrl": obj.thumb_url,
                            "width": obj.width,
                            "height": obj.height,
                            "size": obj.file_size,
                            "sizeType": obj.size_type,
                        })
                        .to_string());
                    }
                }
                9 => {
                    if let Ok(obj) = crate::proto::imweb::DynamicImageObj::decode(plain.as_slice()) {
                        return Ok(serde_json::json!({
                            "url": obj.url,
                            "gif": obj.url,
                            "thumbnailUrl": obj.thumb_url,
                            "thumbUrl": obj.thumb_url,
                            "width": obj.width,
                            "height": obj.height,
                            "size": obj.file_size,
                        })
                        .to_string());
                    }
                }
                2 => {
                    if let Ok(obj) = crate::proto::imweb::AudioObj::decode(plain.as_slice()) {
                        return Ok(serde_json::json!({
                            "url": obj.url,
                            "duration": obj.duration,
                            "size": obj.file_size,
                        })
                        .to_string());
                    }
                }
                3 => {
                    if let Ok(obj) = crate::proto::imweb::VideoObj::decode(plain.as_slice()) {
                        return Ok(serde_json::json!({
                            "url": obj.url,
                            "thumbUrl": obj.thumb_url,
                            "thumbnailUrl": obj.thumb_url,
                            "duration": obj.duration,
                            "width": obj.width,
                            "height": obj.height,
                            "size": obj.file_size,
                        })
                        .to_string());
                    }
                }
                5 => {
                    if let Ok(obj) = crate::proto::imweb::NameCardObj::decode(plain.as_slice()) {
                        return Ok(name_card_obj_to_legacy_content(obj));
                    }
                }
                12 => {
                    if let Ok(obj) = crate::proto::imweb::SetImageObj::decode(plain.as_slice()) {
                        return Ok(obj.current_image.to_string());
                    }
                }
                18 => {
                    if let Ok(obj) = crate::proto::imweb::AnimatedGameObj::decode(plain.as_slice())
                    {
                        return Ok(obj.current_image);
                    }
                }
                _ => {}
            }
            if let Ok(obj) = crate::proto::imweb::TextObj::decode(plain.as_slice()) {
                return Ok(obj.content);
            }
            String::from_utf8(plain).map_err(|e| format!("utf8 decode failed: {}", e))
        }
        Err(e) => {
            tracing::warn!(
                target: "e2ee",
                "[channel] decrypt_channel_incoming FAILED channel_id={} cipher_len={} key_cached={} err={}",
                channel_id,
                data.len(),
                key_cached,
                e,
            );
            Err(e.to_string())
        }
    }
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

fn summarize_log_content(content: Option<&str>) -> (usize, String, bool) {
    let raw = content.unwrap_or("");
    let mut head: String = raw.chars().take(120).collect();
    if raw.chars().count() > 120 {
        head.push_str("...");
    }
    (raw.len(), head, raw.contains("data:image/"))
}

#[tauri::command]
pub async fn mark_message_sent(
    db: State<'_, DbManager>,
    uid: String,
    request: MarkMessageSentRequest,
) -> Result<(), String> {
    let server_id = request.server_msg_id.to_string();
    let sent_time = request.sent_over_time.unwrap_or(0);
    warn!(
        target: "receipt",
        "[receipt] mark_message_sent start uid={} conversation_id={} custom_msg_id={} server_msg_id={} sent_time={}",
        uid,
        request.conversation_id,
        request.custom_msg_id,
        request.server_msg_id,
        sent_time
    );

    db.with_connection(&uid, |conn| {
        let local_row = conn
            .query_row(
                "SELECT msg_type, content FROM messages WHERE custom_msg_id = ?1 AND conversation_id = ?2",
                rusqlite::params![request.custom_msg_id, request.conversation_id],
                |row| Ok((row.get::<_, i32>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .optional()
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        let local_exists = local_row.is_some();
        let (local_msg_type, local_content) = local_row.unwrap_or((0, None));

        let duplicate = if local_exists {
            conn.query_row(
                "SELECT content, extra, read_status, send_time
                 FROM messages
                 WHERE id = ?1 AND conversation_id = ?2 AND COALESCE(custom_msg_id, '') <> ?3",
                rusqlite::params![server_id, request.conversation_id, request.custom_msg_id],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, i32>(2)?,
                        row.get::<_, i64>(3)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?
        } else {
            None
        };

        let (duplicate_content, duplicate_extra, duplicate_read_status, duplicate_send_time) =
            duplicate.unwrap_or((None, None, 0, 0));
        let duplicate_content = duplicate_content.filter(|content| !content.trim().is_empty());
        let duplicate_dice_result = dice_result_from_content(duplicate_content.as_deref());
        let local_dice_result = dice_result_from_content(local_content.as_deref());
        let merged_content = if local_msg_type == 12 {
            if duplicate_dice_result.is_some() {
                duplicate_content.clone()
            } else if local_dice_result.is_some() {
                local_content.clone()
            } else {
                local_content.clone()
            }
        } else {
            duplicate_content.clone().or_else(|| local_content.clone())
        };
        let (local_content_len, local_content_head, local_is_data_image) =
            summarize_log_content(local_content.as_deref());
        let (duplicate_content_len, duplicate_content_head, duplicate_is_data_image) =
            summarize_log_content(duplicate_content.as_deref());
        let (merged_content_len, merged_content_head, merged_is_data_image) =
            summarize_log_content(merged_content.as_deref());
        warn!(
            target: "receipt",
            "[receipt] mark_message_sent merge local_exists={} local_msg_type={} local_content_len={} local_content_head={:?} local_is_data_image={} duplicate_content_len={} duplicate_content_head={:?} duplicate_is_data_image={} duplicate_dice_result={:?} local_dice_result={:?} merged_content_len={} merged_content_head={:?} merged_is_data_image={} duplicate_extra_present={} duplicate_read_status={} duplicate_send_time={} next_server_id={}",
            local_exists,
            local_msg_type,
            local_content_len,
            local_content_head,
            local_is_data_image,
            duplicate_content_len,
            duplicate_content_head,
            duplicate_is_data_image,
            duplicate_dice_result,
            local_dice_result,
            merged_content_len,
            merged_content_head,
            merged_is_data_image,
            duplicate_extra.is_some(),
            duplicate_read_status,
            duplicate_send_time,
            server_id
        );
        let next_sent_time = if sent_time > 0 {
            sent_time
        } else {
            duplicate_send_time
        };
        if request.conversation_id.starts_with("1_") && local_msg_type == 1 {
            warn!(
                target: "group-image",
                "[group-image] mark_message_sent merge local_exists={} custom_msg_id={} server_id={} local_content_len={} duplicate_content_len={} merged_content_len={} next_sent_time={}",
                local_exists,
                request.custom_msg_id,
                server_id,
                local_content_len,
                duplicate_content_len,
                merged_content_len,
                next_sent_time
            );
        }

        if local_exists {
            conn.execute(
                "DELETE FROM messages
                 WHERE id = ?1 AND conversation_id = ?2 AND COALESCE(custom_msg_id, '') <> ?3",
                rusqlite::params![server_id, request.conversation_id, request.custom_msg_id],
            )
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        }

        // 两步：① 用服务端 msg_id 替换本地 id（与老 im `updateMsgProperty` 逻辑一致）；
        //     ② 同一行状态置为 1（sent），read_status 置为 1（发送成功）。
        if next_sent_time > 0 {
            let changed = conn.execute(
                "UPDATE messages
                 SET id = ?1,
                     status = 1,
                     read_status = MAX(read_status, ?2, 1),
                     send_time = ?3,
                     content = COALESCE(NULLIF(?4, ''), content),
                     extra = COALESCE(?5, extra)
                 WHERE custom_msg_id = ?6 AND conversation_id = ?7",
                rusqlite::params![
                    server_id,
                    duplicate_read_status,
                    next_sent_time,
                    merged_content.as_deref(),
                    duplicate_extra.as_deref(),
                    request.custom_msg_id,
                    request.conversation_id,
                ],
            )
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
            warn!(
                target: "receipt",
                "[receipt] mark_message_sent updated with time changed={} server_id={} custom_msg_id={} duplicate_content_len={} merged_content_len={} next_sent_time={}",
                changed,
                server_id,
                request.custom_msg_id,
                duplicate_content_len,
                merged_content_len,
                next_sent_time
            );
        } else {
            let changed = conn.execute(
                "UPDATE messages
                 SET id = ?1,
                     status = 1,
                     read_status = MAX(read_status, ?2, 1),
                     content = COALESCE(NULLIF(?3, ''), content),
                     extra = COALESCE(?4, extra)
                 WHERE custom_msg_id = ?5 AND conversation_id = ?6",
                rusqlite::params![
                    server_id,
                    duplicate_read_status,
                    merged_content.as_deref(),
                    duplicate_extra.as_deref(),
                    request.custom_msg_id,
                    request.conversation_id,
                ],
            )
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
            warn!(
                target: "receipt",
                "[receipt] mark_message_sent updated no time changed={} server_id={} custom_msg_id={} duplicate_content_len={} merged_content_len={}",
                changed,
                server_id,
                request.custom_msg_id,
                duplicate_content_len,
                merged_content_len
            );
        }

        // 同步会话摘要 → 服务端 id / 服务端时间，避免左侧列表继续显示发送前旧摘要。
        let digest = message_digest(local_msg_type, merged_content.as_deref());
        conn.execute(
            "UPDATE conversations
             SET last_msg_id = ?1,
                 last_msg_time = CASE WHEN ?2 > 0 THEN ?2 ELSE last_msg_time END,
                 last_msg_digest = CASE WHEN ?3 <> '' THEN ?3 ELSE last_msg_digest END,
                 updated_at = CASE WHEN ?2 > 0 THEN ?2 ELSE updated_at END
             WHERE id = ?4
               AND (
                    last_msg_id = ?5
                    OR last_msg_id = ?1
                    OR last_msg_time IS NULL
                    OR ?2 <= 0
                    OR last_msg_time <= ?2
               )",
            rusqlite::params![
                server_id,
                next_sent_time,
                digest,
                request.conversation_id,
                request.custom_msg_id,
            ],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        Ok(())
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mark_as_read(
    db: State<'_, DbManager>,
    ws_mgr: State<'_, WsManager>,
    uid: String,
    conversation_id: String,
) -> Result<ReadProcessingResult, String> {
    let (conv_type, target_id) = parse_conversation_id(&conversation_id)?;
    let now = chrono::Utc::now().timestamp_millis();

    let (result, receipts) = db
        .with_connection(&uid, |conn| {
            let mut stmt = conn
                .prepare_cached(
                    "SELECT id, sender_id, msg_type, extra
                 FROM messages
                 WHERE conversation_id = ?1
                   AND sender_id != ?2
                   AND is_deleted = 0
                   AND read_status = 0
                 ORDER BY send_time ASC",
                )
                .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

            let rows = stmt
                .query_map(rusqlite::params![conversation_id, uid], |row| {
                    let extra: Option<String> = row.get(3)?;
                    let (snapchat_time, delete_delay_ms) = extract_read_burn_meta(extra.as_deref());
                    Ok(ReadCandidate {
                        id: row.get(0)?,
                        sender_id: row.get(1)?,
                        msg_type: row.get(2)?,
                        delete_delay_ms,
                        snapchat_time,
                        extra,
                    })
                })
                .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

            let candidates = rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

            if !candidates.is_empty() {
                conn.execute(
                    "UPDATE messages
                 SET read_status = 1
                 WHERE conversation_id = ?1
                   AND sender_id != ?2
                   AND is_deleted = 0
                   AND read_status = 0",
                    rusqlite::params![conversation_id, uid],
                )
                .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
            }

            conn.execute(
                "UPDATE conversations SET unread_count = 0 WHERE id = ?1",
                rusqlite::params![conversation_id],
            )
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

            let scheduled_deletions = candidates
                .iter()
                .filter(|item| item.delete_delay_ms > 0)
                .map(|item| ScheduledDeletion {
                    conversation_id: conversation_id.clone(),
                    message_id: item.id.clone(),
                    expire_at: now + item.delete_delay_ms,
                })
                .collect::<Vec<_>>();

            let read_message_ids = candidates
                .iter()
                .map(|item| item.id.clone())
                .collect::<Vec<_>>();

            let mut group_read_updates = Vec::<GroupReadReceiptUpdate>::new();

            if conv_type == 1 {
                for item in &candidates {
                    let mut extra_map = parse_extra_map(item.extra.as_deref());
                    let existing_total = extra_map
                        .get("readTotal")
                        .and_then(|v| v.as_i64())
                        .unwrap_or_default();
                    let existing_users = extra_map
                        .get("readUsers")
                        .and_then(|v| v.as_array())
                        .cloned()
                        .unwrap_or_default();
                    let old_known_count = existing_users.len() as i64;
                    let already_known = existing_users
                        .iter()
                        .any(|entry| read_user_id(entry) == uid.parse::<i64>().ok());

                    let mut read_users = existing_users
                        .into_iter()
                        .filter(|entry| read_user_id(entry) != uid.parse::<i64>().ok())
                        .collect::<Vec<_>>();
                    read_users.push(serde_json::json!({
                        "userId": uid.parse::<i64>().unwrap_or_default(),
                        "readTime": now,
                        "readState": imweb::MsgReceiptStatus::Viewed as i32,
                    }));

                    let baseline_total = existing_total.max(old_known_count);
                    let read_total = if already_known {
                        baseline_total.max(read_users.len() as i64)
                    } else if existing_total > old_known_count {
                        baseline_total + 1
                    } else {
                        read_users.len() as i64
                    };

                    extra_map.insert(
                        "readUsers".to_string(),
                        serde_json::Value::Array(read_users),
                    );
                    extra_map.insert("readTotal".to_string(), serde_json::Value::from(read_total));
                    let next_extra = serde_json::Value::Object(extra_map).to_string();

                    conn.execute(
                        "UPDATE messages
                     SET extra = ?1, read_status = 1
                     WHERE conversation_id = ?2 AND id = ?3",
                        rusqlite::params![next_extra, conversation_id, item.id],
                    )
                    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

                    group_read_updates.push(GroupReadReceiptUpdate {
                        conversation_id: conversation_id.clone(),
                        message_id: item.id.clone(),
                        read_status: 1,
                        extra: Some(next_extra),
                    });
                }
            }

            let receipts = if conv_type == 0 && target_id != queries::FILE_HELPER_TARGET_ID {
                let target_uid = target_id.parse::<i64>().ok();
                candidates
                    .iter()
                    .filter_map(|item| {
                        let msg_id = item.id.parse::<i64>().ok()?;
                        let send_uid = item.sender_id.parse::<i64>().ok()?;
                        let target_uid = target_uid?;
                        Some(imweb::ReceiptMessage {
                            msg_id,
                            r#type: imweb::ChatMessageType::OneToOne as i32,
                            send_uid,
                            group_id: 0,
                            receipt_status: Some(imweb::MsgReceiptStatusBase {
                                status: imweb::MsgReceiptStatus::Viewed as i32,
                                time: now,
                            }),
                            message_type: item.msg_type,
                            snapchat_time: item.snapchat_time,
                            duration: 0,
                            target_id: target_uid,
                            source: imweb::MessageSource::Web as i32,
                        })
                    })
                    .collect::<Vec<_>>()
            } else if conv_type == 1 {
                let group_id = target_id.parse::<i64>().ok();
                candidates
                    .iter()
                    .filter_map(|item| {
                        let msg_id = item.id.parse::<i64>().ok()?;
                        let send_uid = item.sender_id.parse::<i64>().ok()?;
                        let group_id = group_id?;
                        Some(imweb::ReceiptMessage {
                            msg_id,
                            r#type: imweb::ChatMessageType::Group as i32,
                            send_uid,
                            group_id,
                            receipt_status: Some(imweb::MsgReceiptStatusBase {
                                status: imweb::MsgReceiptStatus::Viewed as i32,
                                time: now,
                            }),
                            message_type: item.msg_type,
                            snapchat_time: item.snapchat_time,
                            duration: 0,
                            target_id: group_id,
                            source: imweb::MessageSource::Web as i32,
                        })
                    })
                    .collect::<Vec<_>>()
            } else {
                Vec::new()
            };

            Ok((
                ReadProcessingResult {
                    read_message_ids,
                    local_read_message_ids: Vec::new(),
                    scheduled_deletions,
                    group_read_updates,
                    conversation_read_updates: Vec::new(),
                },
                receipts,
            ))
        })
        .map_err(|e| e.to_string())?;

    if !receipts.is_empty() {
        let req = imweb::SendReceiptMessageReq { receipts };
        let payload = req.encode_to_vec();
        if let Err(err) = ws_mgr.send_packet(
            ws_cmds::SEND_RECEIPT,
            ws_cmds::SEND_RECEIPT as i64,
            &payload,
        ) {
            warn!(
                "mark_as_read send 10106 failed conversation={} err={}",
                conversation_id, err
            );
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn apply_friend_read_receipts(
    db: State<'_, DbManager>,
    uid: String,
    receipts: Vec<ReadReceiptSyncPayload>,
) -> Result<ReadProcessingResult, String> {
    let login_uid = uid.parse::<i64>().unwrap_or_default();
    let now = chrono::Utc::now().timestamp_millis();

    db.with_connection(&uid, |conn| {
        let mut read_message_ids = Vec::<String>::new();
        let mut local_read_message_ids = Vec::<String>::new();
        let mut scheduled_deletions = Vec::<ScheduledDeletion>::new();
        let mut conversation_read_updates = Vec::<ConversationReadUpdate>::new();

        for receipt in receipts {
            if receipt.status != imweb::MsgReceiptStatus::Viewed as i32 {
                continue;
            }
            if receipt.msg_id <= 0 {
                continue;
            }

            // 对齐旧 im `fnMsgReadSync`：sendUid == loginId 表示同账号其它端
            // 已读了 targetId 会话内消息，本端需要按该 msgId 的发送时间清红点。
            if receipt.send_uid == login_uid && receipt.target_id > 0 {
                let conversation_id = format!("0_{}", receipt.target_id);
                let matched_send_time = conn
                    .query_row(
                        "SELECT send_time
                         FROM messages
                         WHERE conversation_id = ?1 AND id = ?2 AND is_deleted = 0
                         LIMIT 1",
                        rusqlite::params![conversation_id, receipt.msg_id.to_string()],
                        |row| row.get::<_, i64>(0),
                    )
                    .optional()
                    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

                let Some(boundary_send_time) = matched_send_time else {
                    continue;
                };

                let mut stmt = conn
                    .prepare_cached(
                        "SELECT id
                         FROM messages
                         WHERE conversation_id = ?1
                           AND sender_id != ?2
                           AND is_deleted = 0
                           AND send_time <= ?3
                           AND read_status = 0
                         ORDER BY send_time ASC",
                    )
                    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
                let ids = stmt
                    .query_map(
                        rusqlite::params![conversation_id, uid, boundary_send_time],
                        |row| row.get::<_, String>(0),
                    )
                    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

                if !ids.is_empty() {
                    conn.execute(
                        "UPDATE messages
                         SET read_status = 1
                         WHERE conversation_id = ?1
                           AND sender_id != ?2
                           AND is_deleted = 0
                           AND send_time <= ?3
                           AND read_status = 0",
                        rusqlite::params![conversation_id, uid, boundary_send_time],
                    )
                    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
                    local_read_message_ids.extend(ids);
                }

                let unread_count = conn
                    .query_row(
                        "SELECT COUNT(*)
                         FROM messages
                         WHERE conversation_id = ?1
                           AND sender_id != ?2
                           AND is_deleted = 0
                           AND read_status = 0",
                        rusqlite::params![conversation_id, uid],
                        |row| row.get::<_, i32>(0),
                    )
                    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
                conn.execute(
                    "UPDATE conversations SET unread_count = ?1 WHERE id = ?2",
                    rusqlite::params![unread_count, conversation_id],
                )
                .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
                conversation_read_updates.push(ConversationReadUpdate {
                    conversation_id,
                    unread_count,
                });
                continue;
            }

            if receipt.target_id != login_uid || receipt.send_uid <= 0 {
                continue;
            }

            let conversation_id = format!("0_{}", receipt.send_uid);
            let receipt_read_time = normalize_external_timestamp(receipt.read_time, now);
            let matched_send_time = conn
                .query_row(
                    "SELECT send_time
                     FROM messages
                     WHERE conversation_id = ?1 AND id = ?2 AND is_deleted = 0
                     LIMIT 1",
                    rusqlite::params![conversation_id, receipt.msg_id.to_string()],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

            // 对方秒读时，20104 已读回执可能早于 20101 发送成功回执到达；
            // 此时本地消息 id 仍是 custom_msg_id，按服务端 msg_id 查不到。
            // 老 im 的语义是“该会话中该时间点前我发出的消息已读”，所以用
            // read_time 兜底，避免阅后即焚消息错过删除计时。
            let boundary_send_time = matched_send_time.unwrap_or(receipt_read_time);

            let mut stmt = conn
                .prepare_cached(
                    "SELECT id, extra
                     FROM messages
                     WHERE conversation_id = ?1
                       AND sender_id = ?2
                       AND is_deleted = 0
                       AND send_time <= ?3
                       AND read_status < 2
                     ORDER BY send_time ASC",
                )
                .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

            let rows = stmt
                .query_map(
                    rusqlite::params![conversation_id, uid, boundary_send_time],
                    |row| {
                        let extra: Option<String> = row.get(1)?;
                        let (_, delete_delay_ms) = extract_read_burn_meta(extra.as_deref());
                        Ok((row.get::<_, String>(0)?, delete_delay_ms))
                    },
                )
                .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

            let candidates = rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

            if candidates.is_empty() {
                if matched_send_time.is_some() {
                    read_message_ids.push(receipt.msg_id.to_string());
                }
                continue;
            }

            conn.execute(
                "UPDATE messages
                 SET read_status = 2
                 WHERE conversation_id = ?1
                   AND sender_id = ?2
                   AND is_deleted = 0
                   AND send_time <= ?3
                   AND read_status < 2",
                rusqlite::params![conversation_id, uid, boundary_send_time],
            )
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

            for (message_id, delete_delay_ms) in candidates {
                read_message_ids.push(message_id.clone());
                if delete_delay_ms > 0 {
                    scheduled_deletions.push(ScheduledDeletion {
                        conversation_id: conversation_id.clone(),
                        message_id,
                        expire_at: receipt_read_time + delete_delay_ms,
                    });
                }
            }
        }

        Ok(ReadProcessingResult {
            read_message_ids,
            local_read_message_ids,
            scheduled_deletions,
            group_read_updates: Vec::new(),
            conversation_read_updates,
        })
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn apply_group_read_receipts(
    db: State<'_, DbManager>,
    uid: String,
    receipts: Vec<GroupReadReceiptSyncPayload>,
) -> Result<ReadProcessingResult, String> {
    let login_uid = uid.parse::<i64>().unwrap_or_default();
    db.with_connection(&uid, |conn| {
        let read_message_ids = Vec::<String>::new();
        let mut local_read_message_ids = Vec::<String>::new();
        let mut updates = Vec::<GroupReadReceiptUpdate>::new();
        let mut conversation_read_updates = Vec::<ConversationReadUpdate>::new();

        for receipt in receipts {
            if receipt.status != imweb::MsgReceiptStatus::Viewed as i32 {
                continue;
            }
            if receipt.group_id <= 0 || receipt.send_uid <= 0 || receipt.msg_id <= 0 {
                continue;
            }

            let conversation_id = format!("1_{}", receipt.group_id);
            let row = conn
                .query_row(
                    "SELECT extra, read_status, send_time
                     FROM messages
                     WHERE conversation_id = ?1
                       AND id = ?2
                       AND is_deleted = 0
                     LIMIT 1",
                    rusqlite::params![conversation_id, receipt.msg_id.to_string()],
                    |row| {
                        Ok((
                            row.get::<_, Option<String>>(0)?,
                            row.get::<_, i32>(1)?,
                            row.get::<_, i64>(2)?,
                        ))
                    },
                )
                .optional()
                .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

            let Some((extra, current_read_status, boundary_send_time)) = row else {
                continue;
            };

            // 对齐旧 im `fnMsgReadSync('group')`：sendUid == loginId 表示
            // 同账号其它端已读了该群消息，本端按这条 msgId 的 send_time 清群未读。
            if receipt.send_uid == login_uid {
                let mut stmt = conn
                    .prepare_cached(
                        "SELECT id
                         FROM messages
                         WHERE conversation_id = ?1
                           AND sender_id != ?2
                           AND is_deleted = 0
                           AND send_time <= ?3
                           AND read_status = 0
                         ORDER BY send_time ASC",
                    )
                    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
                let ids = stmt
                    .query_map(
                        rusqlite::params![conversation_id, uid, boundary_send_time],
                        |row| row.get::<_, String>(0),
                    )
                    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

                if !ids.is_empty() {
                    conn.execute(
                        "UPDATE messages
                         SET read_status = 1
                         WHERE conversation_id = ?1
                           AND sender_id != ?2
                           AND is_deleted = 0
                           AND send_time <= ?3
                           AND read_status = 0",
                        rusqlite::params![conversation_id, uid, boundary_send_time],
                    )
                    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
                    local_read_message_ids.extend(ids);
                }

                let unread_count = conn
                    .query_row(
                        "SELECT COUNT(*)
                         FROM messages
                         WHERE conversation_id = ?1
                           AND sender_id != ?2
                           AND is_deleted = 0
                           AND read_status = 0",
                        rusqlite::params![conversation_id, uid],
                        |row| row.get::<_, i32>(0),
                    )
                    .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
                conn.execute(
                    "UPDATE conversations SET unread_count = ?1 WHERE id = ?2",
                    rusqlite::params![unread_count, conversation_id],
                )
                .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
                conversation_read_updates.push(ConversationReadUpdate {
                    conversation_id: conversation_id.clone(),
                    unread_count,
                });
            }

            let mut extra_map = parse_extra_map(extra.as_deref());
            let existing_total = extra_map
                .get("readTotal")
                .and_then(|v| v.as_i64())
                .unwrap_or_default();
            let existing_users = extra_map
                .get("readUsers")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let old_known_count = existing_users.len() as i64;
            let already_known = existing_users
                .iter()
                .any(|item| read_user_id(item) == Some(receipt.send_uid));

            let mut read_users = existing_users
                .into_iter()
                .filter(|item| read_user_id(item) != Some(receipt.send_uid))
                .collect::<Vec<_>>();
            read_users.push(serde_json::json!({
                "userId": receipt.send_uid,
                "readTime": receipt.read_time,
                "readState": receipt.status,
            }));

            let baseline_total = existing_total.max(old_known_count);
            let read_total = if already_known {
                baseline_total.max(read_users.len() as i64)
            } else if existing_total > old_known_count {
                baseline_total + 1
            } else {
                read_users.len() as i64
            };

            extra_map.insert(
                "readUsers".to_string(),
                serde_json::Value::Array(read_users),
            );
            extra_map.insert("readTotal".to_string(), serde_json::Value::from(read_total));
            let next_extra = serde_json::Value::Object(extra_map).to_string();
            let next_read_status = current_read_status.max(2);

            conn.execute(
                "UPDATE messages
                 SET extra = ?1, read_status = ?2
                 WHERE conversation_id = ?3 AND id = ?4",
                rusqlite::params![
                    next_extra,
                    next_read_status,
                    conversation_id,
                    receipt.msg_id.to_string(),
                ],
            )
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

            updates.push(GroupReadReceiptUpdate {
                conversation_id,
                message_id: receipt.msg_id.to_string(),
                read_status: next_read_status,
                extra: Some(next_extra),
            });
        }

        Ok(ReadProcessingResult {
            read_message_ids,
            local_read_message_ids,
            scheduled_deletions: Vec::new(),
            group_read_updates: updates,
            conversation_read_updates,
        })
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_message(
    app: AppHandle,
    db: State<'_, DbManager>,
    uid: String,
    message_id: String,
) -> Result<(), String> {
    let conversation_id = db
        .with_connection(&uid, |conn| {
            let conversation_id = conn
                .query_row(
                    "SELECT conversation_id
                     FROM messages
                     WHERE id = ?1 OR COALESCE(custom_msg_id, '') = ?1
                     LIMIT 1",
                    rusqlite::params![message_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

            conn.execute(
                "UPDATE messages
                 SET is_deleted = 1
                 WHERE id = ?1 OR COALESCE(custom_msg_id, '') = ?1",
                rusqlite::params![message_id],
            )
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
            if let Some(conv_id) = conversation_id.as_deref() {
                // 删除消息后把会话摘要回退到最新的未删除消息，供左侧列表即时刷新。
                queries::refresh_conversation_summary(conn, conv_id)?;
            }
            Ok(conversation_id)
        })
        .map_err(|e| e.to_string())?;

    if let Some(conv_id) = conversation_id {
        if let Ok(Some(conv)) =
            db.with_connection(&uid, |conn| queries::get_conversation_by_id(conn, &conv_id))
        {
            let _ = app.emit("conv:update", &conv);
        }
    }

    Ok(())
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
pub async fn set_conversation_draft(
    db: State<'_, DbManager>,
    uid: String,
    conversation_id: String,
    draft: Option<String>,
) -> Result<(), String> {
    db.with_connection(&uid, |conn| {
        let (conv_type, target_id) = conversation_id
            .split_once('_')
            .and_then(|(raw_type, target_id)| raw_type.parse::<i32>().ok().map(|t| (t, target_id)))
            .unwrap_or((0, conversation_id.as_str()));

        conn.execute(
            "INSERT OR IGNORE INTO conversations (id, type, target_id, updated_at)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                &conversation_id,
                conv_type,
                target_id,
                chrono::Utc::now().timestamp_millis()
            ],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

        conn.execute(
            "UPDATE conversations SET draft = ?1 WHERE id = ?2",
            rusqlite::params![draft, &conversation_id],
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
    let (db_msg_id, conversation_id) = db
        .with_connection(&uid, |conn| {
            let row = conn
                .query_row(
                    "SELECT id, conversation_id
                 FROM messages
                 WHERE id = ?1 OR COALESCE(custom_msg_id, '') = ?1
                 LIMIT 1",
                    rusqlite::params![message_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .optional()
                .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;

            let Some((db_msg_id, conversation_id)) = row else {
                return Err(crate::db::DbError::SqliteError(format!(
                    "message not found: {}",
                    message_id
                )));
            };

            conn.execute(
                "UPDATE messages
             SET is_deleted = 1
             WHERE id = ?1 OR COALESCE(custom_msg_id, '') = ?1",
                rusqlite::params![message_id],
            )
            .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
            queries::refresh_conversation_summary(conn, &conversation_id)?;
            Ok((db_msg_id, conversation_id))
        })
        .map_err(|e| e.to_string())?;

    let (conv_type, target_id) = parse_conversation_id(&conversation_id)?;
    let target_id_i64 = target_id
        .parse::<i64>()
        .map_err(|_| format!("invalid target id '{}'", target_id))?;
    let msg_id_i64 = db_msg_id
        .parse::<i64>()
        .or_else(|_| message_id.parse::<i64>())
        .map_err(|_| format!("invalid message id '{}'", db_msg_id))?;
    let now = chrono::Utc::now().timestamp_millis();
    let recall = imweb::RecallMessage {
        msg_id: msg_id_i64,
        msg_target_id: target_id_i64,
        channel_name: String::new(),
        clear: 0,
        clear_time: now,
    };

    match conv_type {
        1 => {
            let req = imweb::SendRecallGroupMessageReq {
                recall_group_message: Some(recall),
            };
            ws_mgr
                .send_packet(ws_cmds::RECALL_GROUP_MSG, now, &req.encode_to_vec())
                .map_err(|e| e.to_string())?;
        }
        2 => {
            let req = imweb::SendRecallChannelMessage {
                recall_channel_message: Some(recall),
            };
            ws_mgr
                .send_packet(ws_cmds::RECALL_CHANNEL_MSG, now, &req.encode_to_vec())
                .map_err(|e| e.to_string())?;
        }
        _ => {
            let req = imweb::SendRecallOneToOneMessageReq {
                recall_one_to_one_message: Some(recall),
            };
            ws_mgr
                .send_packet(ws_cmds::RECALL_PRIVATE_MSG, now, &req.encode_to_vec())
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn clear_conversation_history(
    app: AppHandle,
    db: State<'_, DbManager>,
    ws_mgr: State<'_, WsManager>,
    uid: String,
    request: ClearConversationHistoryRequest,
) -> Result<(), String> {
    let remote = request.remote.unwrap_or(false);
    let (conv_type, target_id) = parse_conversation_id(&request.conversation_id)?;
    let target_id_i64 = target_id
        .parse::<i64>()
        .map_err(|_| format!("invalid target id '{}'", target_id))?;

    db.with_connection(&uid, |conn| {
        conn.execute(
            "UPDATE messages SET is_deleted = 1 WHERE conversation_id = ?1",
            rusqlite::params![request.conversation_id],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        queries::refresh_conversation_summary(conn, &request.conversation_id)?;
        conn.execute(
            "UPDATE conversations SET unread_count = 0 WHERE id = ?1",
            rusqlite::params![request.conversation_id],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        Ok(())
    })
    .map_err(|e| e.to_string())?;

    if let Ok(Some(conv)) = db.with_connection(&uid, |conn| {
        queries::get_conversation_by_id(conn, &request.conversation_id)
    }) {
        let _ = app.emit("conv:update", &conv);
    }

    if remote {
        let now = chrono::Utc::now().timestamp_millis();
        let recall = imweb::RecallMessage {
            msg_id: -1,
            msg_target_id: target_id_i64,
            channel_name: String::new(),
            clear: 1,
            clear_time: now,
        };

        match conv_type {
            1 => {
                let req = imweb::SendRecallGroupMessageReq {
                    recall_group_message: Some(recall),
                };
                ws_mgr
                    .send_packet(ws_cmds::RECALL_GROUP_MSG, now, &req.encode_to_vec())
                    .map_err(|e| e.to_string())?;
            }
            2 => {
                let req = imweb::SendRecallChannelMessage {
                    recall_channel_message: Some(recall),
                };
                ws_mgr
                    .send_packet(ws_cmds::RECALL_CHANNEL_MSG, now, &req.encode_to_vec())
                    .map_err(|e| e.to_string())?;
            }
            _ => {
                let req = imweb::SendRecallOneToOneMessageReq {
                    recall_one_to_one_message: Some(recall),
                };
                ws_mgr
                    .send_packet(ws_cmds::RECALL_PRIVATE_MSG, now, &req.encode_to_vec())
                    .map_err(|e| e.to_string())?;
            }
        }
    }

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
            "DELETE FROM messages WHERE conversation_id = ?1",
            rusqlite::params![conversation_id],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
        conn.execute(
            "DELETE FROM schedule_deletion WHERE conversation_id = ?1",
            rusqlite::params![conversation_id],
        )
        .map_err(|e| crate::db::DbError::SqliteError(e.to_string()))?;
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
