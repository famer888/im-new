use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::State;

use crate::db::{models, queries, DbError, DbManager};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountHistoryExportPayload {
    pub uid: String,
    pub history: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BlacklistRow {
    uid: String,
    name: Option<String>,
    added_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ScheduleDeletionRow {
    conversation_id: String,
    seconds: i64,
}

#[tauri::command]
pub async fn export_account_history_data(
    db: State<'_, DbManager>,
    uid: String,
) -> Result<AccountHistoryExportPayload, String> {
    let uid = uid.trim().to_string();
    if uid.is_empty() {
        return Err("uid is required".to_string());
    }

    db.get_or_create(&uid).map_err(|e| e.to_string())?;

    let history = db
        .with_connection(&uid, |conn| export_history_value(conn))
        .map_err(|e| e.to_string())?;

    Ok(AccountHistoryExportPayload { uid, history })
}

#[tauri::command]
pub async fn import_account_history_data(
    db: State<'_, DbManager>,
    uid: String,
    history: Value,
) -> Result<usize, String> {
    let uid = uid.trim().to_string();
    if uid.is_empty() {
        return Err("uid is required".to_string());
    }

    let history_obj = history
        .as_object()
        .ok_or_else(|| "history must be an object".to_string())?;

    db.get_or_create(&uid).map_err(|e| e.to_string())?;

    db.with_connection(&uid, |conn| import_history_value(conn, &uid, history_obj))
        .map_err(|e| e.to_string())
}

fn export_history_value(conn: &Connection) -> Result<Value, DbError> {
    let conversations = get_all_conversations(conn)?;
    let messages = get_all_messages(conn)?;
    let contacts = queries::get_contacts(conn)?;
    let groups = queries::get_groups(conn)?;
    let group_members = get_all_group_members(conn)?;
    let channels = get_all_channels(conn)?;
    let blacklist = get_all_blacklist(conn)?;
    let schedule_deletion = get_all_schedule_deletion(conn)?;

    let mut history = Map::new();
    if !conversations.is_empty() {
        history.insert(
            "conversations".to_string(),
            serde_json::to_value(conversations).map_err(json_err)?,
        );
    }
    if !messages.is_empty() {
        history.insert(
            "messages".to_string(),
            serde_json::to_value(messages).map_err(json_err)?,
        );
    }
    if !contacts.is_empty() {
        history.insert(
            "contacts".to_string(),
            serde_json::to_value(contacts).map_err(json_err)?,
        );
    }
    if !groups.is_empty() {
        history.insert(
            "groups".to_string(),
            serde_json::to_value(groups).map_err(json_err)?,
        );
    }
    if !group_members.is_empty() {
        history.insert(
            "group_members".to_string(),
            serde_json::to_value(group_members).map_err(json_err)?,
        );
    }
    if !channels.is_empty() {
        history.insert(
            "channels".to_string(),
            serde_json::to_value(channels).map_err(json_err)?,
        );
    }
    if !blacklist.is_empty() {
        history.insert(
            "blacklist".to_string(),
            serde_json::to_value(blacklist).map_err(json_err)?,
        );
    }
    if !schedule_deletion.is_empty() {
        history.insert(
            "schedule_deletion".to_string(),
            serde_json::to_value(schedule_deletion).map_err(json_err)?,
        );
    }

    Ok(Value::Object(history))
}

pub fn import_history_value(
    conn: &Connection,
    uid: &str,
    history_obj: &Map<String, Value>,
) -> Result<usize, DbError> {
    let current_format_keys = [
        "conversations",
        "messages",
        "contacts",
        "groups",
        "group_members",
        "channels",
        "blacklist",
        "schedule_deletion",
    ];

    let is_current_format = history_obj
        .keys()
        .any(|key| current_format_keys.contains(&key.as_str()));

    if is_current_format {
        import_current_format_history(conn, history_obj)
    } else {
        import_legacy_history(conn, uid, history_obj)
    }
}

fn import_current_format_history(
    conn: &Connection,
    history_obj: &Map<String, Value>,
) -> Result<usize, DbError> {
    let mut imported_count = 0usize;
    let mut touched_conversations = HashSet::new();

    if let Some(rows) = history_obj.get("conversations").and_then(Value::as_array) {
        for row in rows {
            let conversation: models::Conversation =
                serde_json::from_value(row.clone()).map_err(json_err)?;
            conn.execute(
                "INSERT OR REPLACE INTO conversations
                 (id, type, target_id, last_msg_id, last_msg_time, last_msg_digest,
                  unread_count, is_pinned, is_muted, is_archived, draft, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    conversation.id,
                    conversation.conv_type,
                    conversation.target_id,
                    conversation.last_msg_id,
                    conversation.last_msg_time,
                    conversation.last_msg_digest,
                    conversation.unread_count,
                    conversation.is_pinned as i32,
                    conversation.is_muted as i32,
                    conversation.is_archived as i32,
                    conversation.draft,
                    conversation.updated_at,
                ],
            )
            .map_err(|e| DbError::SqliteError(e.to_string()))?;
        }
    }

    if let Some(rows) = history_obj.get("messages").and_then(Value::as_array) {
        for row in rows {
            let message: models::Message = serde_json::from_value(row.clone()).map_err(json_err)?;
            ensure_conversation_exists(conn, &message.conversation_id, message.send_time)?;
            touched_conversations.insert(message.conversation_id.clone());
            conn.execute(
                "INSERT OR REPLACE INTO messages
                 (id, custom_msg_id, conversation_id, sender_id, msg_type, content,
                  send_time, status, read_status, version, is_deleted, extra)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    message.id,
                    message.custom_msg_id,
                    message.conversation_id,
                    message.sender_id,
                    message.msg_type,
                    message.content,
                    message.send_time,
                    message.status,
                    message.read_status,
                    message.version,
                    message.is_deleted as i32,
                    message.extra,
                ],
            )
            .map_err(|e| DbError::SqliteError(e.to_string()))?;
            imported_count += 1;
        }
    }

    if let Some(rows) = history_obj.get("contacts").and_then(Value::as_array) {
        for row in rows {
            let contact: models::Contact = serde_json::from_value(row.clone()).map_err(json_err)?;
            conn.execute(
                "INSERT OR REPLACE INTO contacts (id, nickname, avatar, pinyin, remark, status, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    contact.id,
                    contact.nickname,
                    contact.avatar,
                    contact.pinyin,
                    contact.remark,
                    contact.status,
                    contact.updated_at,
                ],
            )
            .map_err(|e| DbError::SqliteError(e.to_string()))?;
        }
    }

    if let Some(rows) = history_obj.get("groups").and_then(Value::as_array) {
        for row in rows {
            let group: models::Group = serde_json::from_value(row.clone()).map_err(json_err)?;
            conn.execute(
                "INSERT OR REPLACE INTO groups
                 (id, name, avatar, owner_id, member_count, notice, is_muted, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    group.id,
                    group.name,
                    group.avatar,
                    group.owner_id,
                    group.member_count,
                    group.notice,
                    group.is_muted as i32,
                    group.updated_at,
                ],
            )
            .map_err(|e| DbError::SqliteError(e.to_string()))?;
        }
    }

    if let Some(rows) = history_obj.get("group_members").and_then(Value::as_array) {
        for row in rows {
            let member: models::GroupMember =
                serde_json::from_value(row.clone()).map_err(json_err)?;
            conn.execute(
                "INSERT OR REPLACE INTO group_members (group_id, user_id, nickname, role)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    member.group_id,
                    member.user_id,
                    member.nickname,
                    member.role
                ],
            )
            .map_err(|e| DbError::SqliteError(e.to_string()))?;
        }
    }

    if let Some(rows) = history_obj.get("channels").and_then(Value::as_array) {
        for row in rows {
            let channel: models::Channel = serde_json::from_value(row.clone()).map_err(json_err)?;
            conn.execute(
                "INSERT OR REPLACE INTO channels (id, name, avatar, owner_id, description, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    channel.id,
                    channel.name,
                    channel.avatar,
                    channel.owner_id,
                    channel.description,
                    channel.updated_at,
                ],
            )
            .map_err(|e| DbError::SqliteError(e.to_string()))?;
        }
    }

    if let Some(rows) = history_obj.get("blacklist").and_then(Value::as_array) {
        for row in rows {
            let blacklist_row: BlacklistRow =
                serde_json::from_value(row.clone()).map_err(json_err)?;
            conn.execute(
                "INSERT OR REPLACE INTO blacklist (uid, name, added_at) VALUES (?1, ?2, ?3)",
                params![
                    blacklist_row.uid,
                    blacklist_row.name,
                    blacklist_row.added_at
                ],
            )
            .map_err(|e| DbError::SqliteError(e.to_string()))?;
        }
    }

    if let Some(rows) = history_obj
        .get("schedule_deletion")
        .and_then(Value::as_array)
    {
        for row in rows {
            let deletion_row: ScheduleDeletionRow =
                serde_json::from_value(row.clone()).map_err(json_err)?;
            conn.execute(
                "INSERT OR REPLACE INTO schedule_deletion (conversation_id, seconds) VALUES (?1, ?2)",
                params![deletion_row.conversation_id, deletion_row.seconds],
            )
            .map_err(|e| DbError::SqliteError(e.to_string()))?;
        }
    }

    for conversation_id in touched_conversations {
        queries::refresh_conversation_summary(conn, &conversation_id)?;
    }

    Ok(imported_count)
}

fn import_legacy_history(
    conn: &Connection,
    uid: &str,
    history_obj: &Map<String, Value>,
) -> Result<usize, DbError> {
    let mut imported_count = 0usize;
    let mut touched_conversations = HashSet::new();
    let mut legacy_conversation_meta: HashMap<String, (i32, String)> = HashMap::new();

    for (table_name, rows_value) in history_obj {
        let Some((conv_type, target_id, conversation_id)) =
            parse_legacy_table_name(table_name, uid)
        else {
            continue;
        };

        legacy_conversation_meta
            .entry(conversation_id.clone())
            .or_insert((conv_type, target_id));

        let Some(rows) = rows_value.as_array() else {
            continue;
        };

        for (index, row) in rows.iter().enumerate() {
            let Some(message) = legacy_message_to_current(row, &conversation_id, index) else {
                continue;
            };

            ensure_conversation_exists(conn, &message.conversation_id, message.send_time)?;
            conn.execute(
                "INSERT OR REPLACE INTO messages
                 (id, custom_msg_id, conversation_id, sender_id, msg_type, content,
                  send_time, status, read_status, version, is_deleted, extra)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    message.id,
                    message.custom_msg_id,
                    message.conversation_id,
                    message.sender_id,
                    message.msg_type,
                    message.content,
                    message.send_time,
                    message.status,
                    message.read_status,
                    message.version,
                    message.is_deleted as i32,
                    message.extra,
                ],
            )
            .map_err(|e| DbError::SqliteError(e.to_string()))?;
            touched_conversations.insert(conversation_id.clone());
            imported_count += 1;
        }
    }

    for (conversation_id, (conv_type, target_id)) in legacy_conversation_meta {
        conn.execute(
            "INSERT OR IGNORE INTO conversations (id, type, target_id, updated_at)
             VALUES (?1, ?2, ?3, COALESCE((SELECT MAX(send_time) FROM messages WHERE conversation_id = ?1), 0))",
            params![conversation_id, conv_type, target_id],
        )
        .map_err(|e| DbError::SqliteError(e.to_string()))?;
        // 即使没有解析出消息，也保证会话窗口存在。
        if !touched_conversations.contains(&conversation_id) {
            touched_conversations.insert(conversation_id);
        }
    }

    for conversation_id in touched_conversations {
        queries::refresh_conversation_summary(conn, &conversation_id)?;
    }

    Ok(imported_count)
}

fn get_all_conversations(conn: &Connection) -> Result<Vec<models::Conversation>, DbError> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT id, type, target_id, last_msg_id, last_msg_time, last_msg_digest,
                    unread_count, is_pinned, is_muted, is_archived, draft, updated_at
             FROM conversations
             ORDER BY updated_at DESC",
        )
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(models::Conversation {
                id: row.get(0)?,
                conv_type: row.get(1)?,
                target_id: row.get(2)?,
                last_msg_id: row.get(3)?,
                last_msg_time: row.get(4)?,
                last_msg_digest: row.get(5)?,
                unread_count: row.get(6)?,
                is_pinned: row.get::<_, i32>(7)? != 0,
                is_muted: row.get::<_, i32>(8)? != 0,
                is_archived: row.get::<_, i32>(9)? != 0,
                draft: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| DbError::SqliteError(e.to_string()))
}

fn get_all_messages(conn: &Connection) -> Result<Vec<models::Message>, DbError> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT id, custom_msg_id, conversation_id, sender_id, msg_type, content,
                    send_time, status, read_status, version, is_deleted, extra
             FROM messages
             ORDER BY send_time ASC",
        )
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(models::Message {
                id: row.get(0)?,
                custom_msg_id: row.get(1)?,
                conversation_id: row.get(2)?,
                sender_id: row.get(3)?,
                msg_type: row.get(4)?,
                content: row.get(5)?,
                send_time: row.get(6)?,
                status: row.get(7)?,
                read_status: row.get(8)?,
                version: row.get(9)?,
                is_deleted: row.get::<_, i32>(10)? != 0,
                extra: row.get(11)?,
            })
        })
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| DbError::SqliteError(e.to_string()))
}

fn get_all_group_members(conn: &Connection) -> Result<Vec<models::GroupMember>, DbError> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT group_id, user_id, nickname, role
             FROM group_members
             ORDER BY group_id ASC, role DESC, nickname ASC",
        )
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(models::GroupMember {
                group_id: row.get(0)?,
                user_id: row.get(1)?,
                nickname: row.get(2)?,
                avatar: None,
                role: row.get(3)?,
            })
        })
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| DbError::SqliteError(e.to_string()))
}

fn get_all_channels(conn: &Connection) -> Result<Vec<models::Channel>, DbError> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT id, name, avatar, owner_id, description, updated_at
             FROM channels
             ORDER BY updated_at DESC",
        )
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

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
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| DbError::SqliteError(e.to_string()))
}

fn get_all_blacklist(conn: &Connection) -> Result<Vec<BlacklistRow>, DbError> {
    let mut stmt = conn
        .prepare_cached("SELECT uid, name, added_at FROM blacklist ORDER BY added_at DESC")
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(BlacklistRow {
                uid: row.get(0)?,
                name: row.get(1)?,
                added_at: row.get(2)?,
            })
        })
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| DbError::SqliteError(e.to_string()))
}

fn get_all_schedule_deletion(conn: &Connection) -> Result<Vec<ScheduleDeletionRow>, DbError> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT conversation_id, seconds
             FROM schedule_deletion
             ORDER BY conversation_id ASC",
        )
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ScheduleDeletionRow {
                conversation_id: row.get(0)?,
                seconds: row.get(1)?,
            })
        })
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| DbError::SqliteError(e.to_string()))
}

fn ensure_conversation_exists(
    conn: &Connection,
    conversation_id: &str,
    updated_at: i64,
) -> Result<(), DbError> {
    let (conv_type, target_id) = parse_conversation_parts(conversation_id);
    conn.execute(
        "INSERT OR IGNORE INTO conversations (id, type, target_id, updated_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![conversation_id, conv_type, target_id, updated_at],
    )
    .map_err(|e| DbError::SqliteError(e.to_string()))?;
    Ok(())
}

fn parse_conversation_parts(conversation_id: &str) -> (i32, String) {
    let mut parts = conversation_id.splitn(2, '_');
    let conv_type = parts
        .next()
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(0);
    let target_id = parts.next().unwrap_or(conversation_id).to_string();
    (conv_type, target_id)
}

fn parse_legacy_table_name(table_name: &str, uid: &str) -> Option<(i32, String, String)> {
    let prefix = format!("{uid}-");
    let rest = table_name.strip_prefix(&prefix)?;

    if let Some(target_id) = rest.strip_prefix("message.man") {
        let target_id = target_id.trim().to_string();
        if target_id.is_empty() {
            return None;
        }
        return Some((0, target_id.clone(), format!("0_{target_id}")));
    }

    if let Some(target_id) = rest.strip_prefix("groupMessage.man") {
        let target_id = target_id.trim().to_string();
        if target_id.is_empty() {
            return None;
        }
        return Some((1, target_id.clone(), format!("1_{target_id}")));
    }

    if let Some(target_id) = rest.strip_prefix("channelMessage.man") {
        let target_id = target_id.trim().to_string();
        if target_id.is_empty() {
            return None;
        }
        return Some((2, target_id.clone(), format!("2_{target_id}")));
    }

    None
}

fn legacy_message_to_current(
    row: &Value,
    conversation_id: &str,
    index: usize,
) -> Option<models::Message> {
    let obj = row.as_object()?;
    let send_time = value_to_i64(obj.get("sendTime"))?;
    let msg_type = value_to_i32(obj.get("msgType"))
        .or_else(|| value_to_i32(obj.get("chatType")))
        .unwrap_or(0);

    let custom_msg_id = value_to_string(obj.get("customMsgId")).filter(|v| !v.trim().is_empty());
    let fallback_id = format!("legacy_{conversation_id}_{send_time}_{index}");
    let id = value_to_string(obj.get("MsgID"))
        .or_else(|| value_to_string(obj.get("msgId")))
        .or_else(|| custom_msg_id.clone())
        .filter(|v| !v.trim().is_empty())
        .unwrap_or(fallback_id);

    let sender_id = value_to_string(obj.get("sendUid"))
        .or_else(|| nested_string(obj.get("sendUser"), "uid"))
        .or_else(|| nested_nested_string(obj.get("sendMember"), "user", "uid"))
        .or_else(|| value_to_string(obj.get("receiveUid")))
        .unwrap_or_default();

    let read_status = value_to_i32(obj.get("readStatus")).unwrap_or(0);
    let status = match read_status {
        x if x <= -1 => 0,
        2 => 3,
        _ => 1,
    };

    let content = value_to_string(obj.get("content"))
        .filter(|v| !v.trim().is_empty())
        .or_else(|| {
            obj.get("Content").and_then(|v| match v {
                Value::String(s) if !s.trim().is_empty() && s.trim() != "{}" => Some(s.clone()),
                Value::Object(_) | Value::Array(_) => Some(v.to_string()),
                _ => None,
            })
        })
        .filter(|v| !v.trim().is_empty());
    // 空正文的历史消息入库只会显示空气泡，直接跳过。
    let content = content?;

    Some(models::Message {
        id,
        custom_msg_id: custom_msg_id.or_else(|| {
            Some(format!(
                "legacy_custom_{conversation_id}_{send_time}_{index}"
            ))
        }),
        conversation_id: conversation_id.to_string(),
        sender_id,
        msg_type,
        content: Some(content),
        send_time,
        status,
        read_status,
        version: value_to_i64(obj.get("version")).unwrap_or(0),
        is_deleted: false,
        extra: Some(row.to_string()),
    })
}

fn value_to_string(value: Option<&Value>) -> Option<String> {
    let value = value?;
    match value {
        Value::Null => None,
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Object(_) | Value::Array(_) => Some(value.to_string()),
    }
}

fn value_to_i64(value: Option<&Value>) -> Option<i64> {
    let value = value?;
    match value {
        Value::Number(n) => n.as_i64(),
        Value::String(s) => s.trim().parse::<i64>().ok(),
        _ => None,
    }
}

fn value_to_i32(value: Option<&Value>) -> Option<i32> {
    value_to_i64(value).and_then(|v| i32::try_from(v).ok())
}

fn nested_string(value: Option<&Value>, key: &str) -> Option<String> {
    value?
        .as_object()?
        .get(key)
        .and_then(|v| value_to_string(Some(v)))
}

fn nested_nested_string(value: Option<&Value>, parent: &str, key: &str) -> Option<String> {
    let parent_value = value?.as_object()?.get(parent)?;
    parent_value
        .as_object()?
        .get(key)
        .and_then(|v| value_to_string(Some(v)))
}

fn json_err(err: serde_json::Error) -> DbError {
    DbError::SqliteError(err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;
    use serde_json::json;

    #[test]
    fn imports_old_app_private_and_group_history() {
        let uid = "10001";
        let conn = Connection::open_in_memory().expect("open memory db");
        run_migrations(&conn).expect("run migrations");

        let history = json!({
            "10001-message.man20001": [
                {
                    "MsgID": "private-msg-1",
                    "customMsgId": "private-custom-1",
                    "sendUid": "10001",
                    "sendTime": 1000,
                    "msgType": 1,
                    "content": "private hello"
                }
            ],
            "10001-groupMessage.man30001": [
                {
                    "MsgID": "group-msg-1",
                    "customMsgId": "group-custom-1",
                    "sendUid": "20001",
                    "sendTime": 2000,
                    "msgType": 1,
                    "content": "group hello"
                }
            ]
        });
        let history_obj = history.as_object().expect("history object");

        let imported = import_history_value(&conn, uid, history_obj).expect("import history");
        assert_eq!(imported, 2);

        let private_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE conversation_id = '0_20001'",
                [],
                |row| row.get(0),
            )
            .expect("private count");
        let group_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE conversation_id = '1_30001'",
                [],
                |row| row.get(0),
            )
            .expect("group count");
        assert_eq!(private_count, 1);
        assert_eq!(group_count, 1);

        let conversation_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM conversations WHERE id IN ('0_20001', '1_30001')",
                [],
                |row| row.get(0),
            )
            .expect("conversation count");
        assert_eq!(conversation_count, 2);
    }
}
