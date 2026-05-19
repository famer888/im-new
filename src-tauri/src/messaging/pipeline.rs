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
use crate::db::queries::FILE_HELPER_TARGET_ID;
use crate::ws::{
    commands::{SEND_CHANNEL_MSG, SEND_GROUP_MSG, SEND_PRIVATE_MSG},
    WsError, WsManager,
};

#[derive(Debug, thiserror::Error)]
pub enum SendError {
    #[error(
        "group rel key not cached for {0}; call derive_group_key or cache_group_rel_key first"
    )]
    MissingGroupKey(String),
    #[error("friend rel key not cached for {0}; call derive_friend_rel_key first")]
    MissingFriendKey(String),
    #[error("channel rel key not cached for {0}; call derive_channel_rel_key first")]
    MissingChannelKey(String),

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

/// 发送一条群消息。
///
/// `flag` 需要调用方生成（与本地 `Message.custom_msg_id` 一致），用来匹配
/// 服务端 20201 回执里带回的 flag，从而把本地 "sending" 消息升级为 "sent"。
pub fn send_group_message(
    ws: &WsManager,
    crypto: &CryptoEngine,
    group_id_str: &str,
    sender_uid_str: &str,
    msg_type: i32,
    content: &str,
    send_time: i64,
    flag: i64,
    at_uids: Vec<i64>,
) -> Result<(), SendError> {
    let group_id: i64 = group_id_str
        .parse()
        .map_err(|_| SendError::InvalidId(format!("group_id '{}' not numeric", group_id_str)))?;
    let sender_uid: i64 = sender_uid_str.parse().map_err(|_| {
        SendError::InvalidId(format!("sender_uid '{}' not numeric", sender_uid_str))
    })?;

    let is_functional_message = msg_type == 12 || msg_type == 18;
    let rel_key = if is_functional_message {
        String::new()
    } else {
        crypto
            .get_group_key(group_id_str)
            .ok_or_else(|| SendError::MissingGroupKey(group_id_str.to_string()))?
    };

    let content_plain = super::encode_content_obj(msg_type, content);
    let attachment_file_key = super::extract_attachment_file_key(content);
    let payload = super::build_send_group_message_req(
        group_id,
        sender_uid,
        msg_type,
        &content_plain,
        &rel_key,
        send_time,
        flag,
        at_uids,
        attachment_file_key.as_deref(),
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

/// 发送一条群文本消息。
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
    send_group_message(
        ws,
        crypto,
        group_id_str,
        sender_uid_str,
        0,
        text,
        send_time,
        flag,
        at_uids,
    )
}

/// 发送一条群简介消息。
pub fn send_group_notice_message(
    ws: &WsManager,
    crypto: &CryptoEngine,
    group_id_str: &str,
    sender_uid_str: &str,
    content: &str,
    notice_id: i64,
    show_notify: bool,
    send_time: i64,
    flag: i64,
) -> Result<(), SendError> {
    let group_id: i64 = group_id_str
        .parse()
        .map_err(|_| SendError::InvalidId(format!("group_id '{}' not numeric", group_id_str)))?;
    let sender_uid: i64 = sender_uid_str.parse().map_err(|_| {
        SendError::InvalidId(format!("sender_uid '{}' not numeric", sender_uid_str))
    })?;
    let rel_key = crypto
        .get_group_key(group_id_str)
        .ok_or_else(|| SendError::MissingGroupKey(group_id_str.to_string()))?;

    let content_plain = super::encode_group_notice_obj(content, notice_id, show_notify);
    let payload = super::build_send_group_message_req(
        group_id,
        sender_uid,
        8,
        &content_plain,
        &rel_key,
        send_time,
        flag,
        Vec::new(),
        None,
    )?;

    ws.send_packet(SEND_GROUP_MSG, flag, &payload)?;
    info!(
        "sent SEND_GROUP_NOTICE_MSG group_id={} flag={} notice_id={} show_notify={} bytes={}",
        group_id,
        flag,
        notice_id,
        show_notify,
        payload.len()
    );
    Ok(())
}

/// 发送一条频道消息（4101）。
pub fn send_channel_message(
    ws: &WsManager,
    crypto: &CryptoEngine,
    channel_id_str: &str,
    sender_uid_str: &str,
    msg_type: i32,
    content: &str,
    send_time: i64,
    flag: i64,
    at_uids: Vec<i64>,
) -> Result<(), SendError> {
    let channel_id: i64 = channel_id_str.parse().map_err(|_| {
        SendError::InvalidId(format!("channel_id '{}' not numeric", channel_id_str))
    })?;
    let sender_uid: i64 = sender_uid_str.parse().map_err(|_| {
        SendError::InvalidId(format!("sender_uid '{}' not numeric", sender_uid_str))
    })?;

    let rel_key = crypto
        .get_channel_key(channel_id_str)
        .ok_or_else(|| SendError::MissingChannelKey(channel_id_str.to_string()))?;

    let content_plain = super::encode_content_obj(msg_type, content);
    let attachment_file_key = super::extract_attachment_file_key(content);
    let payload = super::build_send_channel_message_req(
        channel_id,
        sender_uid,
        msg_type,
        &content_plain,
        &rel_key,
        send_time,
        flag,
        at_uids,
        attachment_file_key.as_deref(),
    )?;

    ws.send_packet(SEND_CHANNEL_MSG, flag, &payload)?;
    info!(
        "sent SEND_CHANNEL_MSG channel_id={} flag={} bytes={}",
        channel_id,
        flag,
        payload.len()
    );
    Ok(())
}

/// 发送一条频道文本消息（4101）。
pub fn send_channel_text(
    ws: &WsManager,
    crypto: &CryptoEngine,
    channel_id_str: &str,
    sender_uid_str: &str,
    text: &str,
    send_time: i64,
    flag: i64,
    at_uids: Vec<i64>,
) -> Result<(), SendError> {
    send_channel_message(
        ws,
        crypto,
        channel_id_str,
        sender_uid_str,
        0,
        text,
        send_time,
        flag,
        at_uids,
    )
}

/// 发送一条单聊消息（10101）。
pub fn send_private_message(
    ws: &WsManager,
    crypto: &CryptoEngine,
    friend_uid_str: &str,
    sender_uid_str: &str,
    msg_type: i32,
    content: &str,
    send_time: i64,
    flag: i64,
    snapchat_time: i32,
) -> Result<(), SendError> {
    let friend_uid: i64 = friend_uid_str.parse().map_err(|_| {
        SendError::InvalidId(format!("friend_uid '{}' not numeric", friend_uid_str))
    })?;
    let sender_uid: i64 = sender_uid_str.parse().map_err(|_| {
        SendError::InvalidId(format!("sender_uid '{}' not numeric", sender_uid_str))
    })?;

    // 获取各种终端的 rel_key 及其 version，并转换 version 为 i32
    let friend_app_key = crypto
        .get_latest_friend_key_with_version(friend_uid_str, "app")
        .map(|(v, k)| (v as i32, k));
    let friend_web_key = crypto
        .get_latest_friend_key_with_version(friend_uid_str, "web")
        .map(|(v, k)| (v as i32, k));
    let own_app_key = crypto
        .get_latest_friend_key_with_version(sender_uid_str, "app")
        .map(|(v, k)| (v as i32, k));
    let own_web_key = crypto
        .get_latest_friend_key_with_version(sender_uid_str, "web")
        .map(|(v, k)| (v as i32, k));

    let is_file_helper = friend_uid_str == FILE_HELPER_TARGET_ID;
    let is_functional_message = msg_type == 12 || msg_type == 18;
    if friend_app_key.is_none()
        && friend_web_key.is_none()
        && !is_file_helper
        && !is_functional_message
    {
        return Err(SendError::MissingFriendKey(friend_uid_str.to_string()));
    }

    let content_plain = super::encode_content_obj(msg_type, content);
    let attachment_file_key = super::extract_attachment_file_key(content);
    let payload = super::build_send_private_message_req(
        friend_uid,
        sender_uid,
        msg_type,
        &content_plain,
        friend_app_key,
        friend_web_key,
        own_app_key,
        own_web_key,
        send_time,
        flag,
        snapchat_time,
        attachment_file_key.as_deref(),
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

/// 发送一条单聊文本消息（10101）。
pub fn send_private_text(
    ws: &WsManager,
    crypto: &CryptoEngine,
    friend_uid_str: &str,
    sender_uid_str: &str,
    text: &str,
    send_time: i64,
    flag: i64,
    snapchat_time: i32,
) -> Result<(), SendError> {
    send_private_message(
        ws,
        crypto,
        friend_uid_str,
        sender_uid_str,
        0,
        text,
        send_time,
        flag,
        snapchat_time,
    )
}
