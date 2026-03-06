use rusqlite::{params, Connection};

use super::models::*;
use super::DbError;

// ─── Conversations ───

pub fn get_conversations(conn: &Connection, limit: i64, offset: i64) -> Result<Vec<Conversation>, DbError> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT id, type, target_id, last_msg_id, last_msg_time, last_msg_digest, 
                    unread_count, is_pinned, is_muted, draft, updated_at
             FROM conversations
             ORDER BY is_pinned DESC, updated_at DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    let rows = stmt
        .query_map(params![limit, offset], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                conv_type: row.get(1)?,
                target_id: row.get(2)?,
                last_msg_id: row.get(3)?,
                last_msg_time: row.get(4)?,
                last_msg_digest: row.get(5)?,
                unread_count: row.get(6)?,
                is_pinned: row.get::<_, i32>(7)? != 0,
                is_muted: row.get::<_, i32>(8)? != 0,
                draft: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| DbError::SqliteError(e.to_string()))
}

// ─── Messages ───

pub fn get_messages(
    conn: &Connection,
    conversation_id: &str,
    before_time: Option<i64>,
    limit: i64,
) -> Result<Vec<Message>, DbError> {
    let sql = if before_time.is_some() {
        "SELECT id, custom_msg_id, conversation_id, sender_id, msg_type, content,
                send_time, status, read_status, version, is_deleted, extra
         FROM messages
         WHERE conversation_id = ?1 AND send_time < ?2 AND is_deleted = 0
         ORDER BY send_time DESC
         LIMIT ?3"
    } else {
        "SELECT id, custom_msg_id, conversation_id, sender_id, msg_type, content,
                send_time, status, read_status, version, is_deleted, extra
         FROM messages
         WHERE conversation_id = ?1 AND is_deleted = 0
         ORDER BY send_time DESC
         LIMIT ?3"
    };

    let mut stmt = conn
        .prepare_cached(sql)
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    let time = before_time.unwrap_or(i64::MAX);
    let rows = stmt
        .query_map(params![conversation_id, time, limit], |row| {
            Ok(Message {
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

    let mut messages: Vec<Message> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    messages.reverse(); // Return in chronological order
    Ok(messages)
}

pub fn insert_message(conn: &Connection, msg: &Message) -> Result<(), DbError> {
    conn.execute(
        "INSERT OR REPLACE INTO messages (id, custom_msg_id, conversation_id, sender_id, 
         msg_type, content, send_time, status, read_status, version, is_deleted, extra)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            msg.id,
            msg.custom_msg_id,
            msg.conversation_id,
            msg.sender_id,
            msg.msg_type,
            msg.content,
            msg.send_time,
            msg.status,
            msg.read_status,
            msg.version,
            msg.is_deleted as i32,
            msg.extra,
        ],
    )
    .map_err(|e| DbError::SqliteError(e.to_string()))?;

    Ok(())
}

pub fn batch_insert_messages(conn: &Connection, msgs: &[Message]) -> Result<(), DbError> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    {
        let mut stmt = tx
            .prepare_cached(
                "INSERT OR REPLACE INTO messages (id, custom_msg_id, conversation_id, sender_id,
                 msg_type, content, send_time, status, read_status, version, is_deleted, extra)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            )
            .map_err(|e| DbError::SqliteError(e.to_string()))?;

        for msg in msgs {
            stmt.execute(params![
                msg.id,
                msg.custom_msg_id,
                msg.conversation_id,
                msg.sender_id,
                msg.msg_type,
                msg.content,
                msg.send_time,
                msg.status,
                msg.read_status,
                msg.version,
                msg.is_deleted as i32,
                msg.extra,
            ])
            .map_err(|e| DbError::SqliteError(e.to_string()))?;
        }
    }

    tx.commit()
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    Ok(())
}

// ─── Search ───

pub fn search_messages(
    conn: &Connection,
    query: &str,
    conversation_id: Option<&str>,
    limit: i64,
) -> Result<Vec<Message>, DbError> {
    let sql = if conversation_id.is_some() {
        "SELECT m.id, m.custom_msg_id, m.conversation_id, m.sender_id, m.msg_type, 
                m.content, m.send_time, m.status, m.read_status, m.version, m.is_deleted, m.extra
         FROM messages m
         JOIN messages_fts fts ON m.rowid = fts.rowid
         WHERE fts.content MATCH ?1 AND m.conversation_id = ?2 AND m.is_deleted = 0
         ORDER BY m.send_time DESC
         LIMIT ?3"
    } else {
        "SELECT m.id, m.custom_msg_id, m.conversation_id, m.sender_id, m.msg_type,
                m.content, m.send_time, m.status, m.read_status, m.version, m.is_deleted, m.extra
         FROM messages m
         JOIN messages_fts fts ON m.rowid = fts.rowid
         WHERE fts.content MATCH ?1 AND m.is_deleted = 0
         ORDER BY m.send_time DESC
         LIMIT ?3"
    };

    let mut stmt = conn
        .prepare_cached(sql)
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    let conv = conversation_id.unwrap_or("");
    let rows = stmt
        .query_map(params![query, conv, limit], |row| {
            Ok(Message {
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

// ─── Contacts ───

pub fn get_contacts(conn: &Connection) -> Result<Vec<Contact>, DbError> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT id, nickname, avatar, pinyin, remark, status, updated_at
             FROM contacts ORDER BY pinyin ASC",
        )
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Contact {
                id: row.get(0)?,
                nickname: row.get(1)?,
                avatar: row.get(2)?,
                pinyin: row.get(3)?,
                remark: row.get(4)?,
                status: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| DbError::SqliteError(e.to_string()))
}

// ─── Groups ───

pub fn get_groups(conn: &Connection) -> Result<Vec<Group>, DbError> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT id, name, avatar, owner_id, member_count, notice, is_muted, updated_at
             FROM groups ORDER BY updated_at DESC",
        )
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Group {
                id: row.get(0)?,
                name: row.get(1)?,
                avatar: row.get(2)?,
                owner_id: row.get(3)?,
                member_count: row.get(4)?,
                notice: row.get(5)?,
                is_muted: row.get::<_, i32>(6)? != 0,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| DbError::SqliteError(e.to_string()))
}

pub fn get_group_members(conn: &Connection, group_id: &str) -> Result<Vec<GroupMember>, DbError> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT group_id, user_id, nickname, role
             FROM group_members WHERE group_id = ?1
             ORDER BY role DESC, nickname ASC",
        )
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    let rows = stmt
        .query_map(params![group_id], |row| {
            Ok(GroupMember {
                group_id: row.get(0)?,
                user_id: row.get(1)?,
                nickname: row.get(2)?,
                role: row.get(3)?,
            })
        })
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| DbError::SqliteError(e.to_string()))
}
