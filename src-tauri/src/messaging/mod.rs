//! 消息内容编码 + E2EE 封装 + WS 发送组装。
//!
//! 这是老 im `utils/messageBuild.js` + `utils/e2ee/index.js::fnFormartMsgParams`
//! 的 Rust 化最小等价实现，当前阶段只覆盖文本类群消息：
//!
//! 1. `encode_text_obj`：把用户输入的纯文本编成 `TextObj` protobuf；
//! 2. `encrypt_with_rel_key`：用已获取的群 relKey 对内容做 AES-128-ECB；
//! 3. `build_send_group_message_req`：填充 `GroupMessage` + `SendGroupMessageReq`
//!    并 protobuf 编码，产出可直接喂给 `WsManager::send_packet(10201, ...)` 的 bytes。
//!
//! 密钥（自身 curve25519 私钥 / 群 publicKey/msgKey）由上层负责喂给 `CryptoEngine`，
//! 本模块本身不做网络请求，也不做密钥派生调用。

use md5::{Digest, Md5};
use prost::Message as _;

use crate::crypto::{self, CryptoError};
use crate::proto::imweb;

pub mod pipeline;

/// 将纯文本编码为 `TextObj` protobuf（仅设置 content，忽略 ref）。
///
/// 与老 im `fnEncode(text, 0)` 默认分支一致：没有 `-||-uid:` 引用信息时
/// 仅填充 `content` 字段。
pub fn encode_text_obj(content: &str) -> Vec<u8> {
    let obj = imweb::TextObj {
        content: content.to_string(),
        r#ref: None,
    };
    obj.encode_to_vec()
}

/// 将前端图片内容编码为旧 im 使用的 ImageObj protobuf。
///
/// 兼容两种输入：
/// - 新项目 UI 的 JSON：`{ url, thumbnailUrl, width, height, size }`
/// - 旧 im 解码后的内容串：`url||thumbUrl||fileSize||sizeType`
pub fn encode_image_obj(content: &str) -> Vec<u8> {
    let raw = content.trim();
    let (url, mut thumb_url, width, height, file_size, size_type) =
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) {
            let url = value
                .get("url")
                .or_else(|| value.get("fileUrl"))
                .or_else(|| value.get("path"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let thumb_url = value
                .get("thumbnailUrl")
                .or_else(|| value.get("thumbUrl"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let width = value.get("width").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let height = value.get("height").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let file_size = value
                .get("size")
                .or_else(|| value.get("fileSize"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let size_type = value.get("sizeType").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            (url, thumb_url, width, height, file_size, size_type)
        } else {
            let parts: Vec<&str> = raw.split("||").collect();
            let url = parts.get(0).copied().unwrap_or_default().to_string();
            let thumb_url = parts.get(1).copied().unwrap_or_default().to_string();
            let file_size = parts
                .get(2)
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(0);
            let size_type = parts
                .get(3)
                .and_then(|v| v.parse::<i32>().ok())
                .unwrap_or(0);
            (url, thumb_url, 0, 0, file_size, size_type)
        };

    if thumb_url.is_empty() {
        thumb_url = url.clone();
    }

    let obj = imweb::ImageObj {
        width,
        height,
        file_size,
        url,
        thumb_url,
        r#ref: None,
        size_type,
    };
    obj.encode_to_vec()
}

/// 将前端音频内容编码为旧 im 使用的 AudioObj protobuf。
///
/// 兼容两种输入：
/// - 新项目 UI 的 JSON：`{ url, duration, size, fileKey }`
/// - 旧 im 解码后的内容串：`url||duration`
pub fn encode_audio_obj(content: &str) -> Vec<u8> {
    let raw = content.trim();
    let (url, duration, file_size) =
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) {
            let url = value
                .get("url")
                .or_else(|| value.get("fileUrl"))
                .or_else(|| value.get("path"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let duration = value
                .get("duration")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;
            let file_size = value
                .get("size")
                .or_else(|| value.get("fileSize"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            (url, duration, file_size)
        } else {
            let parts: Vec<&str> = raw.split("||").collect();
            let url = parts.get(0).copied().unwrap_or_default().to_string();
            let duration = parts
                .get(1)
                .and_then(|v| v.parse::<i32>().ok())
                .unwrap_or(0);
            (url, duration, 0)
        };

    let obj = imweb::AudioObj {
        duration,
        file_size,
        url,
        r#ref: None,
    };
    obj.encode_to_vec()
}

/// 将前端文件内容编码为旧 im 使用的 FileObj protobuf。
pub fn encode_file_obj(content: &str) -> Vec<u8> {
    let raw = content.trim();
    let (file_url, name, size, mime_type) =
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) {
            let file_url = value
                .get("fileUrl")
                .or_else(|| value.get("url"))
                .or_else(|| value.get("path"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let name = value
                .get("name")
                .or_else(|| value.get("fileName"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let size = value
                .get("size")
                .or_else(|| value.get("fileSize"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let mime_type = value
                .get("mimeType")
                .or_else(|| value.get("mime"))
                .or_else(|| value.get("ext"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            (file_url, name, size, mime_type)
        } else {
            let parts: Vec<&str> = raw.split("||").collect();
            let file_url = parts.get(0).copied().unwrap_or_default().to_string();
            let name = parts.get(1).copied().unwrap_or_default().to_string();
            let size = parts
                .get(2)
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(0);
            let mime_type = parts.get(3).copied().unwrap_or_default().to_string();
            (file_url, name, size, mime_type)
        };

    let obj = imweb::FileObj {
        size,
        file_url,
        name,
        mime_type,
        r#ref: None,
    };
    obj.encode_to_vec()
}

pub fn encode_content_obj(msg_type: i32, content: &str) -> Vec<u8> {
    match msg_type {
        1 => encode_image_obj(content),
        2 => encode_audio_obj(content),
        7 => encode_file_obj(content),
        _ => encode_text_obj(content),
    }
}

pub fn extract_attachment_file_key(content: &str) -> Option<String> {
    let value = serde_json::from_str::<serde_json::Value>(content.trim()).ok()?;
    let key = value
        .get("fileKey")
        .or_else(|| value.get("file_key"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or_default();
    if key.is_empty() {
        None
    } else {
        Some(key.to_string())
    }
}

fn encrypt_attachment_key(rel_key: &str, file_key: Option<&str>) -> Result<String, CryptoError> {
    let Some(file_key) = file_key.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(String::new());
    };
    let encrypted = encrypt_with_rel_key(rel_key, file_key.as_bytes())?;
    Ok(hex::encode_upper(encrypted))
}

/// 用 relKey（群 / 频道 / 好友共享密钥）对 content protobuf 做 AES-128-ECB
/// 加密。与老 im `_encrypt2(relKey, contentCode)` 等价。
pub fn encrypt_with_rel_key(rel_key: &str, content: &[u8]) -> Result<Vec<u8>, CryptoError> {
    crypto::aes::encrypt_message(content, rel_key)
}

/// 产出一条可直接交给 WS 发送的 `SendGroupMessageReq` protobuf bytes。
///
/// - `group_id`      目标群 id
/// - `sender_uid`    当前登录人 uid
/// - `msg_type`      `MessageType`（0=文本，1=图片等）
/// - `content_plain` protobuf 编码后的内容（`encode_text_obj` 等的返回值）
/// - `rel_key`       通过 `CryptoEngine::derive_group_key` 得到的群 relKey
/// - `send_time`     本地发送时间戳（毫秒）
/// - `flag`          客户端自定义关联 id（用于匹配 20201 回执，老 im 用 `customMsgId`）
/// - `at_uids`       @ 成员列表
pub fn build_send_group_message_req(
    group_id: i64,
    sender_uid: i64,
    msg_type: i32,
    content_plain: &[u8],
    rel_key: &str,
    send_time: i64,
    flag: i64,
    at_uids: Vec<i64>,
    attachment_file_key: Option<&str>,
) -> Result<Vec<u8>, CryptoError> {
    let encrypted = encrypt_with_rel_key(rel_key, content_plain)?;
    let mut hasher = Md5::new();
    hasher.update(&encrypted);
    let content_md5 = format!("{:x}", hasher.finalize());

    let group_msg = imweb::GroupMessage {
        send_uid: sender_uid,
        group_id,
        msg_type,
        content: encrypted,
        at_uids,
        send_time,
        msg_id: 0,
        send_member: None,
        // 加密版本：与老 im 群消息一致固定 1。
        version: 1,
        content_md5,
        attachment_key: encrypt_attachment_key(rel_key, attachment_file_key)?,
        group_name: String::new(),
        snapchat_time: 0,
        at_users: Vec::new(),
        channel_type: 0,
        msg_from: 0,
        edit: 0,
        links: Vec::new(),
        sent_over_time: 0,
    };

    let req = imweb::SendGroupMessageReq {
        group_msg: Some(group_msg),
        flag,
    };

    Ok(req.encode_to_vec())
}

/// 产出一条可直接交给 WS 发送的 `OneToOneMessageReq` protobuf bytes。
pub fn build_send_private_message_req(
    receive_uid: i64,
    sender_uid: i64,
    msg_type: i32,
    content_plain: &[u8],
    friend_app_key: Option<(i32, String)>,
    friend_web_key: Option<(i32, String)>,
    own_app_key: Option<(i32, String)>,
    own_web_key: Option<(i32, String)>,
    send_time: i64,
    flag: i64,
    snapchat_time: i32,
    attachment_file_key: Option<&str>,
) -> Result<Vec<u8>, CryptoError> {
    let mut hasher = Md5::new();
    hasher.update(content_plain);
    let content_md5 = format!("{:x}", hasher.finalize());

    let encrypt_content = |key_info: Option<(i32, String)>| -> Result<Option<imweb::MessageContent>, CryptoError> {
        if let Some((ver, rel_key)) = key_info {
            let encrypted = encrypt_with_rel_key(&rel_key, content_plain)?;
            Ok(Some(imweb::MessageContent {
                content: encrypted,
                attachment_key: encrypt_attachment_key(&rel_key, attachment_file_key)?,
                version: ver,
            }))
        } else {
            Ok(None)
        }
    };

    let app_content = encrypt_content(friend_app_key)?;
    let web_content = encrypt_content(friend_web_key)?;
    let myself_app_content = encrypt_content(own_app_key)?;
    let myself_web_content = encrypt_content(own_web_key.clone())?;
    let own_web_version = own_web_key.as_ref().map(|(v, _)| *v).unwrap_or(1);

    let one_to_one = imweb::OneToOneMessage {
        msg_id: 0,
        send_uid: sender_uid,
        receive_uid,
        msg_type,
        content: vec![], // Empty for encrypted messages
        send_time,
        // 对齐老 im：私聊 version 使用当前账号 web key 的版本号。
        version: own_web_version,
        content_md5,
        attachment_key: String::new(),
        send_user: None,
        snapchat_time,
        // 对齐老 im：桌面/web 侧统一按 WEB 来源发包。
        source: 1,
        app_content,
        web_content,
        myself_app_content,
        myself_web_content,
        group_send: false,
        channel_type: 0,
        msg_from: 0,
        edit: 0,
        links: Vec::new(),
        sent_over_time: 0,
        channel: 0,
    };

    let req = imweb::OneToOneMessageReq {
        one_to_one_message: Some(one_to_one),
        flag,
    };

    Ok(req.encode_to_vec())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_obj_roundtrip() {
        let bytes = encode_text_obj("你好 world");
        let decoded = imweb::TextObj::decode(bytes.as_slice()).unwrap();
        assert_eq!(decoded.content, "你好 world");
        assert!(decoded.r#ref.is_none());
    }

    #[test]
    fn group_msg_encrypt_matches_relkey_decrypt() {
        let rel_key = "0123456789abcdef"; // 16 char ASCII → 16 bytes
        let plain = encode_text_obj("hi group");
        let req_bytes = build_send_group_message_req(
            10086, 88, 0, &plain, rel_key, 1_700_000_000_000, 42, vec![],
            None,
        )
        .unwrap();

        let decoded = imweb::SendGroupMessageReq::decode(req_bytes.as_slice()).unwrap();
        assert_eq!(decoded.flag, 42);
        let gm = decoded.group_msg.unwrap();
        assert_eq!(gm.group_id, 10086);
        assert_eq!(gm.send_uid, 88);
        assert_eq!(gm.version, 1);

        let dec = crypto::aes::decrypt_message(&gm.content, rel_key).unwrap();
        assert_eq!(dec, plain);
    }
}
