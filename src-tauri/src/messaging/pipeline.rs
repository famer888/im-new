//! 端到端发送流水线。
//!
//! 目前只覆盖"群文本"最小路径。函数会：
//! 1. 从 [`CryptoEngine`] 读出群 relKey（调用方需先通过 `cache_group_rel_key`
//!    或 `derive_group_key` 注入过）；
//! 2. 将纯文本编成 TextObj protobuf；
//! 3. 用 relKey 做 AES-128-ECB 加密；
//! 4. 组装 `SendGroupMessageReq` 并经 [`WsManager::send_packet`] 发出 10201。
//!
//! 与老 im `messageBuild.js` 的 `sendMessage(...) -> fnFormartMsgParams ->
//! CReqSendChatGroup` 等价。

use tracing::info;

use crate::crypto::CryptoEngine;
use crate::ws::{
    commands::{SEND_GROUP_MSG, SEND_PRIVATE_MSG},
    WsError, WsManager,
};

#[derive(Debug, thiserror::Error)]
pub enum SendError {
    #[error("group rel key not cached for {0}; call derive_group_key or cache_group_rel_key first")]
    MissingGroupKey(String),
    #[error("friend rel key not cached for {0}; call derive_friend_rel_key first")]
    MissingFriendKey(String),

    #[error("crypto error: {0}")]
    Crypto(#[from] crate::crypto::CryptoError),

    #[error("websocket error: {0}")]
    Ws(#[from] WsError),

    #[error("invalid id: {0}")]
    InvalidId(String),
}

impl serde::Serialize for SendError {
    fn serialize<S>(&self, s: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        s.serialize_str(&self.to_string())
    }
}

/// 发送一条群文本消息。
///
/// `flag` 需要调用方生成（与本地 `Message.custom_msg_id` 一致），用来匹配
/// 服务端 20201 回执里带回的 flag，从而把本地 "sending" 消息升级为 "sent"。
pub fn send_group_text(
    ws: &WsManager,
    crypto: &CryptoEngine,
    group_id_str: &str,
    sender_uid_str: &str,
    text: &str,
    send_time: i64,
    flag: i64,
    at_uids: Vec<i64>,
) -> Result<(), SendError> {
    let group_id: i64 = group_id_str
        .parse()
        .map_err(|_| SendError::InvalidId(format!("group_id '{}' not numeric", group_id_str)))?;
    let sender_uid: i64 = sender_uid_str
        .parse()
        .map_err(|_| SendError::InvalidId(format!("sender_uid '{}' not numeric", sender_uid_str)))?;

    let rel_key = crypto
        .get_group_key(group_id_str)
        .ok_or_else(|| SendError::MissingGroupKey(group_id_str.to_string()))?;

    let content_plain = super::encode_text_obj(text);
    let payload = super::build_send_group_message_req(
        group_id,
        sender_uid,
        0, // MessageType::Text
        &content_plain,
        &rel_key,
        send_time,
        flag,
        at_uids,
    )?;

    ws.send_packet(SEND_GROUP_MSG, flag, &payload)?;
    info!(
        "sent SEND_GROUP_MSG group_id={} flag={} bytes={}",
        group_id,
        flag,
        payload.len()
    );
    Ok(())
}

/// 发送一条单聊文本消息（10101）。
pub fn send_private_text(
    ws: &WsManager,
    crypto: &CryptoEngine,
    friend_uid_str: &str,
    sender_uid_str: &str,
    text: &str,
    send_time: i64,
    flag: i64,
) -> Result<(), SendError> {
    let friend_uid: i64 = friend_uid_str
        .parse()
        .map_err(|_| SendError::InvalidId(format!("friend_uid '{}' not numeric", friend_uid_str)))?;
    let sender_uid: i64 = sender_uid_str
        .parse()
        .map_err(|_| SendError::InvalidId(format!("sender_uid '{}' not numeric", sender_uid_str)))?;

    // 版本号在服务端可能滚动，发送时按 source 取最新可用 key。
    let rel_key = crypto
        .get_latest_friend_key(friend_uid_str, "web")
        .or_else(|| crypto.get_latest_friend_key(friend_uid_str, "app"))
        .ok_or_else(|| SendError::MissingFriendKey(friend_uid_str.to_string()))?;

    let content_plain = super::encode_text_obj(text);
    let payload = super::build_send_private_message_req(
        friend_uid,
        sender_uid,
        0,
        &content_plain,
        &rel_key,
        send_time,
        flag,
    )?;

    ws.send_packet(SEND_PRIVATE_MSG, flag, &payload)?;
    info!(
        "sent SEND_PRIVATE_MSG friend_uid={} flag={} bytes={}",
        friend_uid,
        flag,
        payload.len()
    );
    Ok(())
}
