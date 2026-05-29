use rusqlite::{params, Connection};

use super::models::*;
use super::DbError;

/// 与前端单聊会话 id 规则一致：`0_{targetId}`；与旧 im/文档「文件传输助手」占位用户 id 对齐
pub const FILE_HELPER_TARGET_ID: &str = "9901";

pub fn is_hidden_message_type(msg_type: i32) -> bool {
    matches!(msg_type, 10 | 13 | 14 | 15)
}

pub fn is_hidden_conversation_summary_message(
    msg_type: i32,
    content: Option<&str>,
    extra: Option<&str>,
) -> bool {
    if is_hidden_message_type(msg_type) {
        return true;
    }

    if msg_type != 8 {
        return false;
    }

    let raw = content.unwrap_or_default().trim();
    raw == "群聊事件"
        && extra
            .unwrap_or_default()
            .contains("\"source\":\"group-event\"")
}

/// 保证本地存在「文件传输助手」会话行（服务端未必下发）
pub fn ensure_file_helper_conversation(conn: &Connection) -> Result<(), DbError> {
    let now = chrono::Utc::now().timestamp_millis();
    let id = format!("0_{FILE_HELPER_TARGET_ID}");
    conn.execute(
        "INSERT OR IGNORE INTO conversations (id, type, target_id, updated_at, is_pinned)
         VALUES (?1, 0, ?2, ?3, 1)",
        params![id, FILE_HELPER_TARGET_ID, now],
    )
    .map_err(|e| DbError::SqliteError(e.to_string()))?;
    Ok(())
}

// ─── Conversations ───

pub fn get_conversations(
    conn: &Connection,
    limit: i64,
    offset: i64,
) -> Result<Vec<Conversation>, DbError> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT 
                c.id,
                c.type,
                c.target_id,
                CASE
                    WHEN lm.id IS NOT NULL THEN lm.id
                    WHEN NOT EXISTS (
                        SELECT 1 FROM messages m
                        WHERE m.conversation_id = c.id AND m.is_deleted = 0
                    ) THEN c.last_msg_id
                    ELSE NULL
                END AS last_msg_id,
                CASE
                    WHEN lm.id IS NOT NULL THEN lm.send_time
                    WHEN NOT EXISTS (
                        SELECT 1 FROM messages m
                        WHERE m.conversation_id = c.id AND m.is_deleted = 0
                    ) THEN COALESCE(NULLIF(c.last_msg_time, 0), 0)
                    ELSE 0
                END AS last_msg_time,
                CASE
                    WHEN lm.id IS NOT NULL AND (c.last_msg_id = lm.id OR c.last_msg_time = lm.send_time) THEN
                        COALESCE(NULLIF(c.last_msg_digest, ''), CASE lm.msg_type
                            WHEN 1 THEN '[图片]'
                            WHEN 9 THEN '[动画表情]'
                            WHEN 2 THEN '[语音]'
                            WHEN 3 THEN '[视频]'
                            WHEN 5 THEN '[名片]'
                            WHEN 7 THEN '[文件]'
                            WHEN 12 THEN '[骰子]'
                            WHEN 18 THEN '[扑克牌]'
                            ELSE substr(trim(COALESCE(lm.content, '')), 1, 200)
                        END)
                    WHEN lm.id IS NOT NULL THEN CASE lm.msg_type
                        WHEN 1 THEN '[图片]'
                        WHEN 9 THEN '[动画表情]'
                        WHEN 2 THEN '[语音]'
                        WHEN 3 THEN '[视频]'
                        WHEN 5 THEN '[名片]'
                        WHEN 7 THEN '[文件]'
                        WHEN 12 THEN '[骰子]'
                        WHEN 18 THEN '[扑克牌]'
                        ELSE substr(trim(COALESCE(lm.content, '')), 1, 200)
                    END
                    WHEN NOT EXISTS (
                        SELECT 1 FROM messages m
                        WHERE m.conversation_id = c.id AND m.is_deleted = 0
                    ) THEN NULLIF(c.last_msg_digest, '')
                    ELSE NULL
                END AS last_msg_digest,
                c.unread_count,
                c.is_pinned,
                c.is_muted,
                c.is_archived,
                c.draft,
                CASE
                    WHEN lm.id IS NOT NULL THEN lm.send_time
                    WHEN NOT EXISTS (
                        SELECT 1 FROM messages m
                        WHERE m.conversation_id = c.id AND m.is_deleted = 0
                    ) THEN c.updated_at
                    ELSE 0
                END AS updated_at
             FROM conversations c
             LEFT JOIN messages lm ON lm.rowid = (
                 SELECT m.rowid
                 FROM messages m
                 WHERE m.conversation_id = c.id
                   AND m.is_deleted = 0
                   AND m.msg_type NOT IN (10, 13, 14, 15)
                   AND NOT (
                       m.msg_type = 8
                       AND trim(COALESCE(m.content, '')) = '群聊事件'
                       AND COALESCE(m.extra, '') LIKE '%\"source\":\"group-event\"%'
                   )
                 ORDER BY m.send_time DESC
                 LIMIT 1
             )
             ORDER BY c.is_pinned DESC, updated_at DESC
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
                is_archived: row.get::<_, i32>(9)? != 0,
                draft: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| DbError::SqliteError(e.to_string()))
}

/// 单条会话（与列表查询字段一致），供 `conv:update` 推送。
pub fn get_conversation_by_id(
    conn: &Connection,
    id: &str,
) -> Result<Option<Conversation>, DbError> {
    let sql = "SELECT 
                c.id,
                c.type,
                c.target_id,
                CASE
                    WHEN lm.id IS NOT NULL THEN lm.id
                    WHEN NOT EXISTS (
                        SELECT 1 FROM messages m
                        WHERE m.conversation_id = c.id AND m.is_deleted = 0
                    ) THEN c.last_msg_id
                    ELSE NULL
                END AS last_msg_id,
                CASE
                    WHEN lm.id IS NOT NULL THEN lm.send_time
                    WHEN NOT EXISTS (
                        SELECT 1 FROM messages m
                        WHERE m.conversation_id = c.id AND m.is_deleted = 0
                    ) THEN COALESCE(NULLIF(c.last_msg_time, 0), 0)
                    ELSE 0
                END AS last_msg_time,
                CASE
                    WHEN lm.id IS NOT NULL AND (c.last_msg_id = lm.id OR c.last_msg_time = lm.send_time) THEN
                        COALESCE(NULLIF(c.last_msg_digest, ''), CASE lm.msg_type
                            WHEN 1 THEN '[图片]'
                            WHEN 9 THEN '[动画表情]'
                            WHEN 2 THEN '[语音]'
                            WHEN 3 THEN '[视频]'
                            WHEN 5 THEN '[名片]'
                            WHEN 7 THEN '[文件]'
                            WHEN 12 THEN '[骰子]'
                            WHEN 18 THEN '[扑克牌]'
                            ELSE substr(trim(COALESCE(lm.content, '')), 1, 200)
                        END)
                    WHEN lm.id IS NOT NULL THEN CASE lm.msg_type
                        WHEN 1 THEN '[图片]'
                        WHEN 9 THEN '[动画表情]'
                        WHEN 2 THEN '[语音]'
                        WHEN 3 THEN '[视频]'
                        WHEN 5 THEN '[名片]'
                        WHEN 7 THEN '[文件]'
                        WHEN 12 THEN '[骰子]'
                        WHEN 18 THEN '[扑克牌]'
                        ELSE substr(trim(COALESCE(lm.content, '')), 1, 200)
                    END
                    WHEN NOT EXISTS (
                        SELECT 1 FROM messages m
                        WHERE m.conversation_id = c.id AND m.is_deleted = 0
                    ) THEN NULLIF(c.last_msg_digest, '')
                    ELSE NULL
                END AS last_msg_digest,
                c.unread_count,
                c.is_pinned,
                c.is_muted,
                c.is_archived,
                c.draft,
                CASE
                    WHEN lm.id IS NOT NULL THEN lm.send_time
                    WHEN NOT EXISTS (
                        SELECT 1 FROM messages m
                        WHERE m.conversation_id = c.id AND m.is_deleted = 0
                    ) THEN c.updated_at
                    ELSE 0
                END AS updated_at
             FROM conversations c
             LEFT JOIN messages lm ON lm.rowid = (
                 SELECT m.rowid
                 FROM messages m
                 WHERE m.conversation_id = c.id
                   AND m.is_deleted = 0
                   AND m.msg_type NOT IN (10, 13, 14, 15)
                   AND NOT (
                       m.msg_type = 8
                       AND trim(COALESCE(m.content, '')) = '群聊事件'
                       AND COALESCE(m.extra, '') LIKE '%\"source\":\"group-event\"%'
                   )
                 ORDER BY m.send_time DESC
                 LIMIT 1
             )
             WHERE c.id = ?1";

    let conv = conn.query_row(sql, params![id], |row| {
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
            is_archived: row.get::<_, i32>(9)? != 0,
            draft: row.get(10)?,
            updated_at: row.get(11)?,
        })
    });

    match conv {
        Ok(c) => Ok(Some(c)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(DbError::SqliteError(e.to_string())),
    }
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

pub fn refresh_conversation_summary(
    conn: &Connection,
    conversation_id: &str,
) -> Result<(), DbError> {
    // 会话摘要始终跟随“最后一条可见未删除消息”，避免左侧列表被红包/转账等隐藏消息推进。
    conn.execute(
        "UPDATE conversations
         SET last_msg_id = (
                 SELECT m.id
                 FROM messages m
                 WHERE m.conversation_id = ?1
                   AND m.is_deleted = 0
                   AND m.msg_type NOT IN (10, 13, 14, 15)
                   AND NOT (
                       m.msg_type = 8
                       AND trim(COALESCE(m.content, '')) = '群聊事件'
                       AND COALESCE(m.extra, '') LIKE '%\"source\":\"group-event\"%'
                   )
                 ORDER BY m.send_time DESC
                 LIMIT 1
             ),
             last_msg_time = COALESCE((
                 SELECT m.send_time
                 FROM messages m
                 WHERE m.conversation_id = ?1
                   AND m.is_deleted = 0
                   AND m.msg_type NOT IN (10, 13, 14, 15)
                   AND NOT (
                       m.msg_type = 8
                       AND trim(COALESCE(m.content, '')) = '群聊事件'
                       AND COALESCE(m.extra, '') LIKE '%\"source\":\"group-event\"%'
                   )
                 ORDER BY m.send_time DESC
                 LIMIT 1
             ), 0),
             last_msg_digest = (
                 SELECT CASE m.msg_type
                     WHEN 1 THEN '[图片]'
                     WHEN 9 THEN '[动画表情]'
                     WHEN 2 THEN '[语音]'
                     WHEN 3 THEN '[视频]'
                     WHEN 5 THEN '[名片]'
                     WHEN 7 THEN '[文件]'
                     WHEN 12 THEN '[骰子]'
                     WHEN 18 THEN '[扑克牌]'
                     ELSE substr(trim(COALESCE(m.content, '')), 1, 200)
                 END
                 FROM messages m
                 WHERE m.conversation_id = ?1
                   AND m.is_deleted = 0
                   AND m.msg_type NOT IN (10, 13, 14, 15)
                   AND NOT (
                       m.msg_type = 8
                       AND trim(COALESCE(m.content, '')) = '群聊事件'
                       AND COALESCE(m.extra, '') LIKE '%\"source\":\"group-event\"%'
                   )
                 ORDER BY m.send_time DESC
                 LIMIT 1
             ),
             updated_at = COALESCE((
                 SELECT m.send_time
                 FROM messages m
                 WHERE m.conversation_id = ?1
                   AND m.is_deleted = 0
                   AND m.msg_type NOT IN (10, 13, 14, 15)
                   AND NOT (
                       m.msg_type = 8
                       AND trim(COALESCE(m.content, '')) = '群聊事件'
                       AND COALESCE(m.extra, '') LIKE '%\"source\":\"group-event\"%'
                   )
                 ORDER BY m.send_time DESC
                 LIMIT 1
             ), 0)
         WHERE id = ?1",
        params![conversation_id],
    )
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
    // 对齐旧 im：消息搜索按“包含关键字”匹配（substring），而不是 FTS 的整词匹配。
    let escaped = query
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    let pattern = format!("%{}%", escaped);

    let messages = if let Some(conv) = conversation_id {
        let mut stmt = conn
            .prepare_cached(
                "SELECT m.id, m.custom_msg_id, m.conversation_id, m.sender_id, m.msg_type,
                        m.content, m.send_time, m.status, m.read_status, m.version, m.is_deleted, m.extra
                 FROM messages m
                 WHERE m.is_deleted = 0
                   AND m.conversation_id = ?2
                   AND m.msg_type IN (0, 8)
                   AND COALESCE(m.content, '') LIKE ?1 ESCAPE '\\'
                 ORDER BY m.send_time DESC
                 LIMIT ?3",
            )
            .map_err(|e| DbError::SqliteError(e.to_string()))?;

        let rows = stmt
            .query_map(params![pattern, conv, limit], |row| {
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
            .map_err(|e| DbError::SqliteError(e.to_string()))?
    } else {
        let mut stmt = conn
            .prepare_cached(
                "SELECT m.id, m.custom_msg_id, m.conversation_id, m.sender_id, m.msg_type,
                        m.content, m.send_time, m.status, m.read_status, m.version, m.is_deleted, m.extra
                 FROM messages m
                 WHERE m.is_deleted = 0
                   AND m.msg_type IN (0, 8)
                   AND COALESCE(m.content, '') LIKE ?1 ESCAPE '\\'
                 ORDER BY m.send_time DESC
                 LIMIT ?2",
            )
            .map_err(|e| DbError::SqliteError(e.to_string()))?;

        let rows = stmt
            .query_map(params![pattern, limit], |row| {
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
            .map_err(|e| DbError::SqliteError(e.to_string()))?
    };

    Ok(messages)
}

// ─── Contacts ───

pub fn get_contacts(conn: &Connection) -> Result<Vec<Contact>, DbError> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT id, nickname, avatar, pinyin, letter, remark, depict, identify, status, updated_at
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
                letter: row.get(4)?,
                remark: row.get(5)?,
                depict: row.get(6)?,
                identify: row.get(7)?,
                status: row.get(8)?,
                updated_at: row.get(9)?,
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
                avatar: None,
                role: row.get(3)?,
            })
        })
        .map_err(|e| DbError::SqliteError(e.to_string()))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| DbError::SqliteError(e.to_string()))
}
