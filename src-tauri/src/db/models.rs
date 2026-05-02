use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    #[serde(rename = "type")]
    pub conv_type: i32,        // 0: friend, 1: group, 2: channel
    pub target_id: String,
    pub last_msg_id: Option<String>,
    pub last_msg_time: i64,
    pub last_msg_digest: Option<String>,
    pub unread_count: i32,
    pub is_pinned: bool,
    pub is_muted: bool,
    #[serde(default)]
    pub is_archived: bool,
    pub draft: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub custom_msg_id: Option<String>,
    pub conversation_id: String,
    pub sender_id: String,
    pub msg_type: i32,
    pub content: Option<String>,
    pub send_time: i64,
    pub status: i32,           // 0: sending, 1: sent, 2: delivered, 3: read
    pub read_status: i32,
    pub version: i64,
    pub is_deleted: bool,
    pub extra: Option<String>, // JSON
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contact {
    pub id: String,
    pub nickname: Option<String>,
    pub avatar: Option<String>,
    pub pinyin: Option<String>,
    pub remark: Option<String>,
    pub status: i32,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: Option<String>,
    pub avatar: Option<String>,
    pub owner_id: Option<String>,
    pub member_count: i32,
    pub notice: Option<String>,
    pub is_muted: bool,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupMember {
    pub group_id: String,
    pub user_id: String,
    pub nickname: Option<String>,
    pub avatar: Option<String>,
    pub role: i32, // 与 proto GroupMemberType 一致：0 群主 1 管理员 2 成员
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    pub id: String,
    pub name: Option<String>,
    pub avatar: Option<String>,
    pub owner_id: Option<String>,
    pub description: Option<String>,
    pub updated_at: i64,
}

/// Query pagination parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pagination {
    pub offset: i64,
    pub limit: i64,
}

impl Default for Pagination {
    fn default() -> Self {
        Self {
            offset: 0,
            limit: 50,
        }
    }
}
