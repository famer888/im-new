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
use crate::proto::{im, imweb};

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

/// 将前端 GIF/动态表情内容编码为旧 im 使用的 DynamicImageObj protobuf。
pub fn encode_dynamic_image_obj(content: &str) -> Vec<u8> {
    let raw = content.trim();
    let (url, mut thumb_url, width, height, file_size) =
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) {
            let url = value
                .get("url")
                .or_else(|| value.get("gif"))
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
            (url, thumb_url, width, height, file_size)
        } else {
            let parts: Vec<&str> = raw.split("||").collect();
            let url = parts.get(0).copied().unwrap_or_default().to_string();
            let thumb_url = parts.get(1).copied().unwrap_or_default().to_string();
            let file_size = parts
                .get(2)
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(0);
            (url, thumb_url, 0, 0, file_size)
        };

    if thumb_url.is_empty() {
        thumb_url = url.clone();
    }

    let obj = imweb::DynamicImageObj {
        width,
        height,
        file_size,
        url,
        thumb_url,
        r#ref: None,
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
            let duration = value.get("duration").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
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

/// 将前端视频内容编码为旧 im 使用的 VideoObj protobuf。
///
/// 兼容：
/// - 新项目 JSON：`{ url, thumbUrl/thumbnailUrl, duration, width, height, size }`
/// - 旧 im 内容串：`url*PthumbUrl||duration||fileSize||width||height`
pub fn encode_video_obj(content: &str) -> Vec<u8> {
    let raw = content.trim();
    let (url, thumb_url, duration, file_size, width, height) =
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) {
            let url = value
                .get("url")
                .or_else(|| value.get("fileUrl"))
                .or_else(|| value.get("path"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let thumb_url = value
                .get("thumbUrl")
                .or_else(|| value.get("thumbnailUrl"))
                .or_else(|| value.get("thumbnail"))
                .or_else(|| value.get("cover"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let duration = value
                .get("duration")
                .and_then(|v| {
                    v.as_i64()
                        .or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok()))
                })
                .unwrap_or(0) as i32;
            let file_size = value
                .get("size")
                .or_else(|| value.get("fileSize"))
                .and_then(|v| {
                    v.as_i64()
                        .or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok()))
                })
                .unwrap_or(0);
            let width = value
                .get("width")
                .and_then(|v| {
                    v.as_i64()
                        .or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok()))
                })
                .unwrap_or(0) as i32;
            let height = value
                .get("height")
                .and_then(|v| {
                    v.as_i64()
                        .or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok()))
                })
                .unwrap_or(0) as i32;
            (url, thumb_url, duration, file_size, width, height)
        } else {
            let parts: Vec<&str> = raw.split("||").collect();
            let head = parts.get(0).copied().unwrap_or_default();
            let media_parts: Vec<&str> = head.split("*P").collect();
            let url = media_parts.get(0).copied().unwrap_or_default().to_string();
            let thumb_url = media_parts.get(1).copied().unwrap_or_default().to_string();
            let duration = parts
                .get(1)
                .and_then(|v| v.parse::<i32>().ok())
                .unwrap_or(0);
            let file_size = parts
                .get(2)
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(0);
            let width = parts
                .get(3)
                .and_then(|v| v.parse::<i32>().ok())
                .unwrap_or(0);
            let height = parts
                .get(4)
                .and_then(|v| v.parse::<i32>().ok())
                .unwrap_or(0);
            (url, thumb_url, duration, file_size, width, height)
        };

    let obj = imweb::VideoObj {
        width,
        height,
        file_size,
        url,
        thumb_url,
        r#ref: None,
        duration,
    };
    obj.encode_to_vec()
}

fn strip_medias_caption_ref_suffix(value: &str) -> &str {
    let end = value.find("-||-type:").unwrap_or(value.len());
    value[..end].trim()
}

fn media_caption_payload(segment: &str) -> Option<(im::CaptionMediaType, String)> {
    let candidates = [
        ("image:", im::CaptionMediaType::Image),
        ("video:", im::CaptionMediaType::Video),
        ("gif:", im::CaptionMediaType::DynamicImage),
    ];
    for (marker, media_type) in candidates {
        if let Some(payload) = segment.strip_prefix(marker) {
            return Some((media_type, payload.trim().to_string()));
        }
        if let Some(index) = segment.find(&format!("||{}", marker)) {
            return Some((
                media_type,
                segment[index + marker.len() + 2..].trim().to_string(),
            ));
        }
    }
    None
}

/// 将频道多图内容编码为旧 im 使用的 MediaTextListObj。
/// 前端仍保留旧 im 的 `image:...|||gif:...##caption##...` 字符串，发送前在这里转成 protobuf。
pub fn encode_media_text_list_obj(content: &str) -> Vec<u8> {
    const CAPTION_SEPARATOR: &str = "##caption##";
    let raw = content.trim();
    let (body, caption) = if let Some(index) = raw.find(CAPTION_SEPARATOR) {
        (
            strip_medias_caption_ref_suffix(&raw[..index]).to_string(),
            strip_medias_caption_ref_suffix(&raw[index + CAPTION_SEPARATOR.len()..]).to_string(),
        )
    } else {
        (
            strip_medias_caption_ref_suffix(raw).to_string(),
            String::new(),
        )
    };

    let objs = body
        .split("|||")
        .filter_map(|segment| {
            let (media_type, payload) = media_caption_payload(segment.trim())?;
            let encoded = match media_type {
                im::CaptionMediaType::Image => encode_image_obj(&payload),
                im::CaptionMediaType::Video => encode_video_obj(&payload),
                im::CaptionMediaType::DynamicImage => encode_dynamic_image_obj(&payload),
            };
            Some(im::MediaObj {
                r#type: media_type as i32,
                content: encoded,
            })
        })
        .collect();

    im::MediaTextListObj {
        objs,
        caption,
        r#ref: None,
    }
    .encode_to_vec()
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

/// 将旧 im 名片内容串编码为 NameCardObj protobuf。
///
/// 兼容：
/// - `昵称*|*|*头像*|*|*uid`
/// - `昵称*|*|*uid`
/// - 新项目 JSON：`{ nickname/name, avatar/pic, uid/id }`
pub fn encode_name_card_obj(content: &str) -> Vec<u8> {
    let raw = content.trim();
    let (nick_name, icon, uid) = if let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) {
        let nick_name = value
            .get("nickname")
            .or_else(|| value.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let icon = value
            .get("avatar")
            .or_else(|| value.get("pic"))
            .or_else(|| value.get("icon"))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let uid = value
            .get("uid")
            .or_else(|| value.get("id"))
            .and_then(|v| {
                v.as_i64()
                    .or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok()))
            })
            .unwrap_or(0);
        (nick_name, icon, uid)
    } else {
        let parts: Vec<&str> = raw.split("*|*|*").collect();
        let nick_name = parts.get(0).copied().unwrap_or_default().to_string();
        let (icon, uid_raw) = match parts.as_slice() {
            [_, avatar, uid, ..] => ((*avatar).to_string(), *uid),
            [_, uid] => (String::new(), *uid),
            _ => (String::new(), ""),
        };
        let uid = uid_raw.parse::<i64>().unwrap_or(0);
        (nick_name, icon, uid)
    };

    let obj = imweb::NameCardObj {
        uid,
        nick_name,
        icon,
        r#ref: None,
    };
    obj.encode_to_vec()
}

/// 将群简介内容编码为旧 im 使用的 GroupNoticeObj protobuf。
pub fn encode_group_notice_obj(content: &str, notice_id: i64, show_notify: bool) -> Vec<u8> {
    let obj = imweb::GroupNoticeObj {
        content: content.to_string(),
        notice_id,
        show_notify,
    };
    obj.encode_to_vec()
}

fn json_i64(value: &serde_json::Value, keys: &[&str]) -> Option<i64> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|v| {
            v.as_i64()
                .or_else(|| v.as_str().and_then(|s| s.trim().parse::<i64>().ok()))
        })
    })
}

fn json_i32(value: &serde_json::Value, keys: &[&str]) -> Option<i32> {
    json_i64(value, keys).map(|v| v as i32)
}

fn json_string(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|v| {
            v.as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .or_else(|| v.as_i64().map(|n| n.to_string()))
        })
    })
}

/// 将骰子功能表情编码为旧 im 使用的 SetImageObj protobuf。
pub fn encode_set_image_obj(content: &str) -> Vec<u8> {
    let raw = content.trim();
    let (set_image_id, current_image, image_size) =
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) {
            let set_image_id = json_i64(&value, &["setImageId", "set_image_id"])
                .filter(|v| *v > 0)
                .unwrap_or(1);
            let current_image = json_i32(&value, &["currentImage", "current_image"]).unwrap_or(0);
            let image_size = json_i32(&value, &["imageSize", "image_size"])
                .filter(|v| *v > 0)
                .unwrap_or(7);
            (set_image_id, current_image, image_size)
        } else {
            (1, 0, 7)
        };

    let obj = imweb::SetImageObj {
        set_image_id,
        image_size,
        current_image,
        r#ref: None,
    };
    tracing::warn!(
        target: "dice",
        "[dice] encode_set_image_obj raw='{}' set_image_id={} current_image={} image_size={}",
        raw,
        set_image_id,
        current_image,
        image_size
    );
    obj.encode_to_vec()
}

/// 将扑克牌功能表情编码为旧 im 使用的 AnimatedGameObj protobuf。
pub fn encode_animated_game_obj(content: &str) -> Vec<u8> {
    let raw = content.trim();
    let (game_id, current_image) = if let Ok(value) = serde_json::from_str::<serde_json::Value>(raw)
    {
        let game_id = json_i32(&value, &["gameId", "game_id"])
            .filter(|v| *v > 0)
            .unwrap_or(1);
        let current_image = json_string(
            &value,
            &["currentImage", "current_image", "result", "value"],
        )
        .unwrap_or_default();
        (game_id, current_image)
    } else {
        (1, raw.to_string())
    };

    let obj = imweb::AnimatedGameObj {
        game_id,
        current_image,
        r#ref: None,
    };
    obj.encode_to_vec()
}

pub fn encode_content_obj(msg_type: i32, content: &str) -> Vec<u8> {
    match msg_type {
        1 => encode_image_obj(content),
        9 => encode_dynamic_image_obj(content),
        2 => encode_audio_obj(content),
        3 => encode_video_obj(content),
        5 => encode_name_card_obj(content),
        7 => encode_file_obj(content),
        8 => encode_group_notice_obj(content, 0, false),
        12 => encode_set_image_obj(content),
        17 => encode_media_text_list_obj(content),
        18 => encode_animated_game_obj(content),
        _ => encode_text_obj(content),
    }
}

fn is_functional_message(msg_type: i32) -> bool {
    msg_type == 12 || msg_type == 18
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
    is_hide: bool,
) -> Result<Vec<u8>, CryptoError> {
    let is_functional = is_functional_message(msg_type);
    let message_content = if is_functional {
        content_plain.to_vec()
    } else {
        encrypt_with_rel_key(rel_key, content_plain)?
    };
    let mut hasher = Md5::new();
    hasher.update(content_plain);
    let content_md5 = format!("{:x}", hasher.finalize());

    let group_msg = imweb::GroupMessage {
        send_uid: sender_uid,
        group_id,
        msg_type,
        content: message_content,
        at_uids,
        send_time,
        msg_id: 0,
        send_member: None,
        // 骰子/扑克牌是旧 im 的功能表情，按明文 protobuf 发；普通群消息固定加密版本 1。
        version: if is_functional { 0 } else { 1 },
        content_md5,
        attachment_key: if is_functional {
            String::new()
        } else {
            encrypt_attachment_key(rel_key, attachment_file_key)?
        },
        group_name: String::new(),
        snapchat_time: 0,
        at_users: Vec::new(),
        channel_type: 0,
        msg_from: 0,
        edit: 0,
        links: Vec::new(),
        sent_over_time: 0,
        is_hide,
    };

    let req = imweb::SendGroupMessageReq {
        group_msg: Some(group_msg),
        flag,
    };

    Ok(req.encode_to_vec())
}

/// 产出一条可直接交给 WS 发送的 `SendChannelMessage` protobuf bytes。
///
/// 对齐老 im `CReqSendChatChannel`：频道消息固定 version=1，内容使用频道
/// relKey 加密后通过 4101 发送。
pub fn build_send_channel_message_req(
    channel_id: i64,
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
    hasher.update(content_plain);
    let content_md5 = format!("{:x}", hasher.finalize());

    let channel_message = imweb::ChannelMessage {
        send_uid: sender_uid,
        channel_id,
        msg_type,
        content: encrypted,
        msg_id: 0,
        read_total: 0,
        msg_time: send_time,
        version: 1,
        content_md5,
        attachment_key: encrypt_attachment_key(rel_key, attachment_file_key)?,
        at_uids,
        channel_type: 0,
        msg_from: 0,
        links: Vec::new(),
    };

    let req = imweb::SendChannelMessage {
        channel_message: Some(channel_message),
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
    is_hide: bool,
) -> Result<Vec<u8>, CryptoError> {
    let mut hasher = Md5::new();
    hasher.update(content_plain);
    let content_md5 = format!("{:x}", hasher.finalize());

    if is_functional_message(msg_type) {
        let raw_message_content = || imweb::MessageContent {
            content: content_plain.to_vec(),
            attachment_key: String::new(),
            version: 0,
        };
        let one_to_one = imweb::OneToOneMessage {
            msg_id: 0,
            send_uid: sender_uid,
            receive_uid,
            msg_type,
            content: content_plain.to_vec(),
            send_time,
            version: 0,
            content_md5,
            attachment_key: String::new(),
            send_user: None,
            snapchat_time,
            source: 1,
            app_content: Some(raw_message_content()),
            web_content: Some(raw_message_content()),
            myself_app_content: Some(raw_message_content()),
            myself_web_content: Some(raw_message_content()),
            group_send: false,
            channel_type: 0,
            msg_from: 0,
            edit: 0,
            links: Vec::new(),
            sent_over_time: 0,
            channel: 0,
            is_hide,
        };

        let req = imweb::OneToOneMessageReq {
            one_to_one_message: Some(one_to_one),
            flag,
        };

        return Ok(req.encode_to_vec());
    }

    let encrypt_content =
        |key_info: Option<(i32, String)>| -> Result<Option<imweb::MessageContent>, CryptoError> {
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
    // 对齐老 im：同账号多端同步内容使用自己的 APP 端 key 加密。
    // 服务端回推到 PC 时可能落在 myselfWebContent 字段，但内容语义仍是
    // “自己的其它端可解”的 appOwn key，而不是当前 PC web key。
    let myself_web_content = myself_app_content.clone();
    let own_web_version = own_web_key.as_ref().map(|(v, _)| *v).unwrap_or(1);

    let one_to_one = imweb::OneToOneMessage {
        msg_id: 0,
        send_uid: sender_uid,
        receive_uid,
        msg_type,
        // 对齐老 im：私聊即使带分端加密块，外层 content 仍然保留编码后的明文内容。
        // 服务端和老协议链路会同时依赖 content/content_md5 + app/web/myself*Content。
        content: content_plain.to_vec(),
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
        is_hide,
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
            10086,
            88,
            0,
            &plain,
            rel_key,
            1_700_000_000_000,
            42,
            vec![],
            None,
            false,
        )
        .unwrap();

        let decoded = imweb::SendGroupMessageReq::decode(req_bytes.as_slice()).unwrap();
        assert_eq!(decoded.flag, 42);
        let gm = decoded.group_msg.unwrap();
        assert_eq!(gm.group_id, 10086);
        assert_eq!(gm.send_uid, 88);
        assert_eq!(gm.version, 1);
        let mut hasher = Md5::new();
        hasher.update(&plain);
        assert_eq!(gm.content_md5, format!("{:x}", hasher.finalize()));

        let dec = crypto::aes::decrypt_message(&gm.content, rel_key).unwrap();
        assert_eq!(dec, plain);
    }

    #[test]
    fn group_image_message_includes_encrypted_attachment_key() {
        let rel_key = "0123456789abcdef";
        let file_key = "1234567890123456";
        let content = serde_json::json!({
            "url": "https://oss.example.test/a.png",
            "thumbnailUrl": "https://oss.example.test/a.png",
            "width": 320,
            "height": 180,
            "size": 1024,
            "fileKey": file_key,
        })
        .to_string();
        let plain = encode_image_obj(&content);
        let attachment_file_key = extract_attachment_file_key(&content);
        let req_bytes = build_send_group_message_req(
            10086,
            88,
            1,
            &plain,
            rel_key,
            1_700_000_000_000,
            42,
            vec![],
            attachment_file_key.as_deref(),
            false,
        )
        .unwrap();

        let decoded = imweb::SendGroupMessageReq::decode(req_bytes.as_slice()).unwrap();
        let gm = decoded.group_msg.unwrap();
        assert_eq!(gm.msg_type, 1);
        assert_eq!(gm.version, 1);
        assert!(!gm.attachment_key.is_empty());

        let attachment_cipher = hex::decode(gm.attachment_key).unwrap();
        let decrypted_file_key = crypto::aes::decrypt_message(&attachment_cipher, rel_key).unwrap();
        assert_eq!(String::from_utf8(decrypted_file_key).unwrap(), file_key);
    }

    #[test]
    fn group_dice_is_sent_as_raw_set_image_obj() {
        let plain = encode_set_image_obj("");
        let req_bytes = build_send_group_message_req(
            10086,
            88,
            12,
            &plain,
            "",
            1_700_000_000_000,
            42,
            vec![],
            None,
            false,
        )
        .unwrap();

        let decoded = imweb::SendGroupMessageReq::decode(req_bytes.as_slice()).unwrap();
        let gm = decoded.group_msg.unwrap();
        assert_eq!(gm.msg_type, 12);
        assert_eq!(gm.version, 0);
        assert_eq!(gm.attachment_key, "");
        assert_eq!(gm.content, plain);
    }

    #[test]
    fn group_notice_is_sent_as_encrypted_group_notice_obj() {
        let rel_key = "0123456789abcdef";
        let plain = encode_group_notice_obj("新的群简介", 12345, true);
        let req_bytes = build_send_group_message_req(
            10086,
            88,
            8,
            &plain,
            rel_key,
            1_700_000_000_000,
            42,
            vec![],
            None,
            false,
        )
        .unwrap();

        let decoded = imweb::SendGroupMessageReq::decode(req_bytes.as_slice()).unwrap();
        let gm = decoded.group_msg.unwrap();
        assert_eq!(gm.msg_type, 8);
        assert_eq!(gm.version, 1);

        let decrypted = crypto::aes::decrypt_message(&gm.content, rel_key).unwrap();
        let notice = imweb::GroupNoticeObj::decode(decrypted.as_slice()).unwrap();
        assert_eq!(notice.content, "新的群简介");
        assert_eq!(notice.notice_id, 12345);
        assert!(notice.show_notify);
    }

    #[test]
    fn hidden_flag_is_encoded_for_private_and_group_text() {
        let rel_key = "0123456789abcdef";
        let plain = encode_text_obj("hidden text");
        let group_req_bytes = build_send_group_message_req(
            10086,
            88,
            0,
            &plain,
            rel_key,
            1_700_000_000_000,
            42,
            vec![],
            None,
            true,
        )
        .unwrap();
        let group_req = imweb::SendGroupMessageReq::decode(group_req_bytes.as_slice()).unwrap();
        assert!(group_req.group_msg.unwrap().is_hide);

        let private_req_bytes = build_send_private_message_req(
            10086,
            88,
            0,
            &plain,
            Some((3, rel_key.to_string())),
            Some((4, rel_key.to_string())),
            Some((5, rel_key.to_string())),
            Some((6, rel_key.to_string())),
            1_700_000_000_000,
            42,
            0,
            None,
            true,
        )
        .unwrap();
        let private_req = imweb::OneToOneMessageReq::decode(private_req_bytes.as_slice()).unwrap();
        assert!(private_req.one_to_one_message.unwrap().is_hide);
    }

    #[test]
    fn private_name_card_is_sent_as_encrypted_name_card_obj() {
        let rel_key = "0123456789abcdef";
        let plain = encode_name_card_obj(
            r#"{"nickname":"Alice","avatar":"https://example.test/a.png","uid":"12345"}"#,
        );
        let req_bytes = build_send_private_message_req(
            10086,
            88,
            5,
            &plain,
            Some((3, rel_key.to_string())),
            Some((4, rel_key.to_string())),
            Some((5, rel_key.to_string())),
            Some((6, rel_key.to_string())),
            1_700_000_000_000,
            42,
            0,
            None,
            false,
        )
        .unwrap();

        let decoded = imweb::OneToOneMessageReq::decode(req_bytes.as_slice()).unwrap();
        let msg = decoded.one_to_one_message.unwrap();
        assert_eq!(msg.msg_type, 5);
        assert_eq!(msg.content, plain);
        assert_eq!(msg.version, 6);

        let web_content = msg.web_content.unwrap();
        assert_eq!(web_content.version, 4);
        let decrypted = crypto::aes::decrypt_message(&web_content.content, rel_key).unwrap();
        assert_eq!(decrypted, plain);

        let card = imweb::NameCardObj::decode(decrypted.as_slice()).unwrap();
        assert_eq!(card.uid, 12345);
        assert_eq!(card.nick_name, "Alice");
        assert_eq!(card.icon, "https://example.test/a.png");
    }

    #[test]
    fn private_dice_does_not_require_encrypted_content_blocks() {
        let plain = encode_set_image_obj("");
        let req_bytes = build_send_private_message_req(
            10086,
            88,
            12,
            &plain,
            None,
            None,
            None,
            None,
            1_700_000_000_000,
            42,
            0,
            None,
            false,
        )
        .unwrap();

        let decoded = imweb::OneToOneMessageReq::decode(req_bytes.as_slice()).unwrap();
        let msg = decoded.one_to_one_message.unwrap();
        assert_eq!(msg.msg_type, 12);
        assert_eq!(msg.version, 0);
        assert_eq!(msg.content, plain);
        assert_eq!(msg.app_content.unwrap().content, plain);
        assert_eq!(msg.web_content.unwrap().version, 0);
    }
}
