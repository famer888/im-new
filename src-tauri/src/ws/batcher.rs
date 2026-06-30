use md5::{Digest, Md5};
use prost::Message as _;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{Duration, Instant};
use tracing::{error, info, warn};

use crate::crypto;
use crate::proto::{im, imweb};
use crate::ws::commands as cmds;

pub const FLUSH_INTERVAL_MS: u64 = 100;
const MAX_BATCH_SIZE: usize = 50;

#[derive(Debug, serde::Serialize, Clone)]
pub struct DecodedMessage {
    pub cmd: u16,
    pub msg_id: String,
    pub conversation_id: String,
    pub sender_id: String,
    pub msg_type: i32,
    pub content: String,
    pub send_time: i64,
    pub status: i32,
    pub read_status: i32,
    pub extra: serde_json::Value,
}

fn decode_content_obj(msg_type: i32, plain: &[u8]) -> String {
    match msg_type {
        1 => match imweb::ImageObj::decode(plain) {
            Ok(obj) => image_obj_to_json(obj),
            Err(_) => String::from_utf8_lossy(plain).to_string(),
        },
        9 => match imweb::DynamicImageObj::decode(plain) {
            Ok(obj) => dynamic_image_obj_to_json(obj),
            Err(_) => String::from_utf8_lossy(plain).to_string(),
        },
        2 => match imweb::AudioObj::decode(plain) {
            Ok(obj) => audio_obj_to_json(obj),
            Err(_) => String::from_utf8_lossy(plain).to_string(),
        },
        3 => match imweb::VideoObj::decode(plain) {
            Ok(obj) => video_obj_to_json(obj),
            Err(_) => String::from_utf8_lossy(plain).to_string(),
        },
        7 => match imweb::FileObj::decode(plain) {
            Ok(obj) => file_obj_to_json(obj),
            Err(_) => String::from_utf8_lossy(plain).to_string(),
        },
        5 => match imweb::NameCardObj::decode(plain) {
            Ok(obj) => name_card_obj_to_legacy_content(obj),
            Err(_) => String::from_utf8_lossy(plain).to_string(),
        },
        8 => match imweb::GroupNoticeObj::decode(plain) {
            Ok(obj) => obj.content,
            Err(_) => String::from_utf8_lossy(plain).to_string(),
        },
        12 => match imweb::SetImageObj::decode(plain) {
            Ok(obj) => {
                let content = set_image_obj_to_legacy_content(obj);
                warn!(
                    target: "dice",
                    "[dice] decode_content_obj SetImageObj plain_len={} content='{}'",
                    plain.len(),
                    content
                );
                content
            }
            Err(err) => {
                let fallback = String::from_utf8_lossy(plain).to_string();
                warn!(
                    target: "dice",
                    "[dice] decode_content_obj SetImageObj failed plain_len={} err={} fallback='{}'",
                    plain.len(),
                    err,
                    fallback
                );
                fallback
            }
        },
        18 => match imweb::AnimatedGameObj::decode(plain) {
            Ok(obj) => animated_game_obj_to_legacy_content(obj),
            Err(_) => String::from_utf8_lossy(plain).to_string(),
        },
        17 => match im::MediaTextListObj::decode(plain) {
            Ok(obj) => media_text_list_obj_to_legacy_content(obj),
            Err(_) => String::from_utf8_lossy(plain).to_string(),
        },
        _ => match imweb::TextObj::decode(plain) {
            Ok(obj) => obj.content,
            Err(_) => String::from_utf8_lossy(plain).to_string(),
        },
    }
}

fn content_md5_matches(plain: &[u8], expected: &str) -> bool {
    let expected = expected.trim();
    if expected.is_empty() {
        return true;
    }
    let mut hasher = Md5::new();
    hasher.update(plain);
    format!("{:x}", hasher.finalize()).eq_ignore_ascii_case(expected)
}

fn validate_plain_content(msg_type: i32, plain: &[u8], content_md5: &str) -> bool {
    if !content_md5_matches(plain, content_md5) {
        return false;
    }
    match msg_type {
        1 => imweb::ImageObj::decode(plain).is_ok(),
        2 => imweb::AudioObj::decode(plain).is_ok(),
        3 => imweb::VideoObj::decode(plain).is_ok(),
        5 => imweb::NameCardObj::decode(plain).is_ok(),
        7 => imweb::FileObj::decode(plain).is_ok(),
        8 => imweb::GroupNoticeObj::decode(plain).is_ok(),
        9 => imweb::DynamicImageObj::decode(plain).is_ok(),
        12 => imweb::SetImageObj::decode(plain).is_ok(),
        17 => im::MediaTextListObj::decode(plain).is_ok(),
        18 => imweb::AnimatedGameObj::decode(plain).is_ok(),
        _ => imweb::TextObj::decode(plain).is_ok(),
    }
}

fn group_notice_meta_from_plain(msg_type: i32, plain: &[u8]) -> Option<(i64, bool)> {
    if msg_type != 8 {
        return None;
    }
    imweb::GroupNoticeObj::decode(plain)
        .ok()
        .map(|obj| (obj.notice_id, obj.show_notify))
}

fn image_obj_to_json(obj: imweb::ImageObj) -> String {
    serde_json::json!({
        "url": obj.url,
        "thumbnailUrl": obj.thumb_url,
        "width": obj.width,
        "height": obj.height,
        "size": obj.file_size,
        "sizeType": obj.size_type,
    })
    .to_string()
}

fn dynamic_image_obj_to_json(obj: imweb::DynamicImageObj) -> String {
    serde_json::json!({
        "url": obj.url,
        "gif": obj.url,
        "thumbnailUrl": obj.thumb_url,
        "thumbUrl": obj.thumb_url,
        "width": obj.width,
        "height": obj.height,
        "size": obj.file_size,
    })
    .to_string()
}

fn audio_obj_to_json(obj: imweb::AudioObj) -> String {
    serde_json::json!({
        "url": obj.url,
        "duration": obj.duration,
        "size": obj.file_size,
    })
    .to_string()
}

fn video_obj_to_json(obj: imweb::VideoObj) -> String {
    serde_json::json!({
        "url": obj.url,
        "thumbUrl": obj.thumb_url,
        "thumbnailUrl": obj.thumb_url,
        "duration": obj.duration,
        "width": obj.width,
        "height": obj.height,
        "size": obj.file_size,
    })
    .to_string()
}

fn media_text_list_obj_to_legacy_content(obj: im::MediaTextListObj) -> String {
    let segments = obj
        .objs
        .into_iter()
        .filter_map(|media| {
            let media_type = im::CaptionMediaType::try_from(media.r#type).ok()?;
            match media_type {
                im::CaptionMediaType::Image => {
                    let item = imweb::ImageObj::decode(media.content.as_slice()).ok()?;
                    Some(format!(
                        "image:{}||{}||{}||{}",
                        item.url, item.thumb_url, item.file_size, item.size_type
                    ))
                }
                im::CaptionMediaType::Video => {
                    let item = imweb::VideoObj::decode(media.content.as_slice()).ok()?;
                    Some(format!(
                        "video:{}*P{}||{}||{}||{}||{}",
                        item.url,
                        item.thumb_url,
                        item.duration,
                        item.file_size,
                        item.width,
                        item.height
                    ))
                }
                im::CaptionMediaType::DynamicImage => {
                    let item = imweb::DynamicImageObj::decode(media.content.as_slice()).ok()?;
                    Some(format!("gif:{}||{}", item.url, item.thumb_url))
                }
            }
        })
        .collect::<Vec<_>>();

    let mut content = segments.join("|||");
    if !obj.caption.trim().is_empty() {
        content.push_str("##caption##");
        content.push_str(obj.caption.trim());
    }
    content
}

fn file_obj_to_json(obj: imweb::FileObj) -> String {
    serde_json::json!({
        "url": obj.file_url,
        "fileUrl": obj.file_url,
        "name": obj.name,
        "size": obj.size,
        "mimeType": obj.mime_type,
    })
    .to_string()
}

fn decode_private_raw_file_fallback(msg_type: i32, plain: &[u8]) -> Option<String> {
    if msg_type != 7 {
        return None;
    }
    imweb::FileObj::decode(plain).ok().map(file_obj_to_json)
}

fn name_card_obj_to_legacy_content(obj: imweb::NameCardObj) -> String {
    if obj.icon.is_empty() {
        format!("{}*|*|*{}", obj.nick_name, obj.uid)
    } else {
        format!("{}*|*|*{}*|*|*{}", obj.nick_name, obj.icon, obj.uid)
    }
}

fn set_image_obj_to_legacy_content(obj: imweb::SetImageObj) -> String {
    if let Some(reference) = obj.r#ref {
        if reference.msg_id > 0 {
            return format!("{}||{}", obj.current_image, reference.msg_id);
        }
    }
    obj.current_image.to_string()
}

fn animated_game_obj_to_legacy_content(obj: imweb::AnimatedGameObj) -> String {
    if let Some(reference) = obj.r#ref {
        if reference.msg_id > 0 {
            return format!("{}||{}", obj.current_image, reference.msg_id);
        }
    }
    obj.current_image
}

fn decode_raw_animated_game_content(raw: &[u8]) -> Option<String> {
    if raw.is_empty() {
        return None;
    }
    imweb::AnimatedGameObj::decode(raw)
        .ok()
        .map(animated_game_obj_to_legacy_content)
}

fn decode_raw_set_image_content(raw: &[u8]) -> Option<String> {
    if raw.is_empty() {
        return None;
    }
    imweb::SetImageObj::decode(raw)
        .ok()
        .map(set_image_obj_to_legacy_content)
        .filter(|content| !content.trim().is_empty())
}

fn dice_result_from_content(content: &str) -> Option<i32> {
    let value = content
        .trim()
        .split("||")
        .next()
        .and_then(|value| value.trim().parse::<i32>().ok())?;
    if (1..=6).contains(&value) {
        Some(value)
    } else {
        None
    }
}

fn has_dice_result_message(messages: &[DecodedMessage]) -> bool {
    messages.iter().any(|msg| {
        (msg.msg_type == 12 && dice_result_from_content(&msg.content).is_some())
            || (msg.msg_type == 18 && !msg.content.trim().is_empty())
    })
}

fn should_emit_subscriber_remove_fallback(
    _event_type: i32,
    _subscriber_operate_type: Option<i32>,
    _channel_id: i64,
    _has_channel_notice: bool,
) -> bool {
    // 对齐旧版 im：订阅者退出/移除事件只消费服务端显式下发的频道通知，
    // 没有 channel_notice_msg 时不要前端自行兜底“您已被移出频道”。
    false
}

fn is_subscriber_remove_notice_text(content: &str) -> bool {
    let normalized = content.trim().to_lowercase();
    if normalized.is_empty() {
        return false;
    }
    normalized.contains("移出频道")
        || normalized.contains("removed from channel")
        || normalized.contains("kicked from channel")
}

fn is_subscriber_remove_event(
    event_type: i32,
    subscriber_operate_type: Option<i32>,
    notice_content: &str,
) -> bool {
    if event_type != 2 {
        return false;
    }
    if subscriber_operate_type == Some(2) {
        return true;
    }
    // 兼容服务端偶发缺失 subscriberOperateType：若通知文本明确是“被移出频道”，仍按移除事件处理。
    is_subscriber_remove_notice_text(notice_content)
}

fn channel_removed_reason(
    event_type: i32,
    subscriber_operate_type: Option<i32>,
    channel_operate_type: Option<i32>,
) -> Option<&'static str> {
    // 对齐旧 im：退出/解散/注销都要删除本地频道会话，但不等同于一定要生成可见通知。
    if event_type == 2 && subscriber_operate_type == Some(2) {
        return Some("subscriber-remove");
    }
    match channel_operate_type {
        Some(4) => Some("dissolved"),
        Some(7) => Some("cancelled"),
        _ => None,
    }
}

#[cfg(test)]
mod private_decode_tests {
    use super::*;

    fn md5_hex(bytes: &[u8]) -> String {
        let mut hasher = Md5::new();
        hasher.update(bytes);
        format!("{:x}", hasher.finalize())
    }

    #[test]
    fn private_text_plain_requires_text_obj() {
        let plain = imweb::TextObj {
            content: "hello".to_string(),
            r#ref: None,
        }
        .encode_to_vec();
        assert!(validate_plain_content(0, &plain, &md5_hex(&plain)));
        assert!(!validate_plain_content(0, b"hello", &md5_hex(b"hello")));
    }

    #[test]
    fn private_plain_rejects_md5_mismatch() {
        let plain = imweb::TextObj {
            content: "hello".to_string(),
            r#ref: None,
        }
        .encode_to_vec();
        assert!(!validate_plain_content(
            0,
            &plain,
            "00000000000000000000000000000000"
        ));
    }

    #[test]
    fn private_versioned_raw_file_decodes_before_pending_fallback() {
        let plain = imweb::FileObj {
            file_url: "https://example.com/0009.xls".to_string(),
            name: "0009.xls".to_string(),
            size: 3870,
            mime_type: "application/vnd.ms-excel".to_string(),
            r#ref: None,
        }
        .encode_to_vec();

        let content = decode_private_raw_file_fallback(7, &plain).unwrap();

        assert!(content.contains("\"name\":\"0009.xls\""));
        assert!(content.contains("\"size\":3870"));
    }

    #[test]
    fn private_attachment_key_falls_back_to_other_source() {
        let crypto = crate::crypto::CryptoEngine::new();
        let friend_id = "10086";
        let file_key = "image-file-key";
        let encrypted =
            crate::crypto::aes::encrypt_message(file_key.as_bytes(), "0123456789abcdef").unwrap();
        crypto.set_friend_key(friend_id, 1, "app", "0123456789abcdef".to_string());

        let resolved =
            decrypt_friend_attachment_key(&crypto, friend_id, 1, "web", &hex::encode(encrypted));

        assert_eq!(resolved.as_deref(), Some(file_key));
    }

    #[test]
    fn group_attachment_key_decrypts_to_file_key() {
        let crypto = crate::crypto::CryptoEngine::new();
        let group_id = "20086";
        let rel_key = "0123456789abcdef";
        let file_key = "mobile-group-image-key";
        let encrypted = crate::crypto::aes::encrypt_message(file_key.as_bytes(), rel_key).unwrap();
        crypto.set_group_key(group_id, rel_key.to_string());

        let resolved = decrypt_group_attachment_key(&crypto, group_id, &hex::encode(encrypted));

        assert_eq!(resolved.as_deref(), Some(file_key));
    }

    #[test]
    fn subscriber_remove_without_notice_should_not_emit_fallback_message() {
        assert!(!should_emit_subscriber_remove_fallback(
            2,
            Some(2),
            1001,
            false
        ));
    }

    #[test]
    fn subscriber_remove_with_notice_should_not_emit_fallback_message() {
        assert!(!should_emit_subscriber_remove_fallback(
            2,
            Some(2),
            1001,
            true
        ));
    }

    #[test]
    fn channel_notice_remove_text_without_subscriber_operate_type_should_be_treated_as_remove() {
        assert!(is_subscriber_remove_event(2, None, "您已被移出频道"));
    }

    #[test]
    fn subscriber_remove_operate_type_should_be_treated_as_remove_even_without_notice_text() {
        assert!(is_subscriber_remove_event(2, Some(2), "频道通知"));
    }

    #[test]
    fn normal_channel_notice_should_not_be_treated_as_remove() {
        assert!(!is_subscriber_remove_event(2, Some(0), "您已加入频道"));
    }

    #[test]
    fn subscriber_remove_should_emit_channel_removed_event() {
        assert_eq!(
            channel_removed_reason(2, Some(2), None),
            Some("subscriber-remove")
        );
    }

    #[test]
    fn dissolved_channel_should_emit_channel_removed_event() {
        assert_eq!(channel_removed_reason(1, None, Some(4)), Some("dissolved"));
    }

    #[test]
    fn cancelled_channel_should_emit_channel_removed_event() {
        assert_eq!(channel_removed_reason(1, None, Some(7)), Some("cancelled"));
    }

    #[test]
    fn normal_channel_event_should_not_emit_channel_removed_event() {
        assert_eq!(channel_removed_reason(2, Some(0), None), None);
        assert_eq!(channel_removed_reason(2, Some(1), None), None);
        assert_eq!(channel_removed_reason(1, None, Some(5)), None);
        assert_eq!(channel_removed_reason(1, None, Some(6)), None);
    }

    fn group_remove_event(actor_uid: i64, removed_uid: i64) -> imweb::GroupReqEventMsgDto {
        imweb::GroupReqEventMsgDto {
            from_uid: actor_uid,
            group_req_type: 6,
            group_member: vec![imweb::GroupMemberBase {
                user: Some(imweb::UserBase {
                    uid: removed_uid,
                    ..Default::default()
                }),
                ..Default::default()
            }],
            ..Default::default()
        }
    }

    fn group_admin_change_event(
        req_type: i32,
        actor_uid: i64,
        target_uid: i64,
    ) -> imweb::GroupReqEventMsgDto {
        imweb::GroupReqEventMsgDto {
            from_uid: actor_uid,
            receive_uid: target_uid,
            group_req_type: req_type,
            group_req_status: 1,
            group_member: vec![imweb::GroupMemberBase {
                user: Some(imweb::UserBase {
                    uid: target_uid,
                    nick_name: "target".to_string(),
                    ..Default::default()
                }),
                r#type: 1,
                ..Default::default()
            }],
            ..Default::default()
        }
    }

    #[test]
    fn group_remove_notice_should_stay_visible_for_removed_member() {
        let item = group_remove_event(1001, 2002);

        assert!(!should_hide_group_remove_notice_for_current_user(
            &item, "2002"
        ));
    }

    #[test]
    fn group_remove_notice_should_stay_visible_for_actor() {
        let item = group_remove_event(1001, 2002);

        assert!(!should_hide_group_remove_notice_for_current_user(
            &item, "1001"
        ));
    }

    #[test]
    fn group_remove_notice_should_hide_for_other_admin_or_owner() {
        let item = group_remove_event(1001, 2002);

        assert!(should_hide_group_remove_notice_for_current_user(
            &item, "3003"
        ));
    }

    #[test]
    fn group_set_admin_for_current_user_should_emit_invitation_notice() {
        let item = group_admin_change_event(8, 1001, 2002);
        let common = imweb::CommonMsgDto {
            msg_id: 8001,
            msg_type: 8,
            update_time: 1_700_000_000,
            ..Default::default()
        };
        let group = imweb::GroupBaseInfo {
            group_id: 3003,
            group_name: "测试群".to_string(),
            ..Default::default()
        };

        let msg = group_admin_change_invitation_message(&item, &common, &group, "2002").unwrap();

        assert_eq!(msg.conversation_id, "1_invitation");
        assert_eq!(msg.content, "#{uids:1001}将你设置为管理员");
        assert_eq!(msg.msg_id, "group-event-3003-8-8001-invitation");
        assert_eq!(msg.extra["groupReqType"], 8);
        assert_eq!(msg.extra["receiveUid"], "2002");
        assert_eq!(msg.extra["sendUid"], "1001");
    }

    #[test]
    fn group_set_admin_for_other_user_should_not_emit_invitation_notice() {
        let item = group_admin_change_event(8, 1001, 2002);
        let common = imweb::CommonMsgDto::default();
        let group = imweb::GroupBaseInfo {
            group_id: 3003,
            ..Default::default()
        };

        assert!(group_admin_change_invitation_message(&item, &common, &group, "4004").is_none());
    }

    #[test]
    fn group_remove_admin_for_current_user_should_emit_invitation_notice() {
        let item = group_admin_change_event(9, 1001, 2002);
        let common = imweb::CommonMsgDto {
            msg_id: 8002,
            msg_type: 9,
            update_time: 1_700_000_001,
            ..Default::default()
        };
        let group = imweb::GroupBaseInfo {
            group_id: 3003,
            group_name: "测试群".to_string(),
            ..Default::default()
        };

        let msg = group_admin_change_invitation_message(&item, &common, &group, "2002").unwrap();

        assert_eq!(msg.conversation_id, "1_invitation");
        assert_eq!(msg.content, "你的管理员身份已被移除");
        assert_eq!(msg.msg_id, "group-event-3003-9-8002-invitation");
        assert_eq!(msg.extra["groupReqType"], 9);
        assert_eq!(msg.extra["receiveUid"], "2002");
    }

    #[test]
    fn group_create_invite_summary_id_should_not_collide_with_accept_event() {
        let group_id = 20260620;
        let inviter_uid = 68;
        let invited_uid = 892;
        let item = imweb::GroupReqEventMsgDto {
            receive_uid: 0,
            from_uid: inviter_uid,
            group_req_type: 1,
            group_req_status: 1,
            group_member: vec![imweb::GroupMemberBase {
                user: Some(imweb::UserBase {
                    uid: invited_uid,
                    nick_name: "892".to_string(),
                    ..Default::default()
                }),
                group_id,
                ..Default::default()
            }],
            ..Default::default()
        };
        let create_common = imweb::CommonMsgDto {
            msg_id: 0,
            msg_type: 1,
            ..Default::default()
        };
        let accept_common = imweb::CommonMsgDto {
            msg_id: 9001,
            msg_type: 4,
            ..Default::default()
        };
        let accept_common_without_msg_id = imweb::CommonMsgDto {
            msg_id: 0,
            msg_type: 4,
            ..Default::default()
        };

        // app 会同时展示创群邀请汇总和后续同意入群提示；两条系统消息不能共用同一个本地 id。
        let create_id = group_req_event_notice_message_id(&item, &create_common, group_id);
        let accept_id = group_req_event_notice_message_id(&item, &accept_common, group_id);
        let fallback_accept_id =
            group_req_event_notice_message_id(&item, &accept_common_without_msg_id, group_id);

        assert_ne!(create_id, accept_id);
        assert_ne!(create_id, fallback_accept_id);
    }

    #[test]
    fn group_live_send_gift_payload_decodes_to_frontend_event() {
        let payload = imweb::PushGroupLiveSendGiftMsg {
            group_id: 123,
            live_room_id: 456,
            gift_id: 0,
            gift_type: 3,
            animation_url: "https://example.com/a.svga".to_string(),
            sound_url: "https://example.com/a.mp3".to_string(),
            gift_name: "金币".to_string(),
            quantity: 1,
            icon_url: "https://example.com/icon.png".to_string(),
            from_uid: 789,
            anchor_uid: 987,
            coin_name: "OCS".to_string(),
            amount: "88".to_string(),
            room_sum_amount: "188".to_string(),
        }
        .encode_to_vec();

        let evt = decode_group_live_send_gift_event(&payload).unwrap();

        assert_eq!(evt.group_id, 123);
        assert_eq!(evt.live_room_id, 456);
        assert_eq!(evt.gift_id, 0);
        assert_eq!(evt.gift_type, 3);
        assert_eq!(evt.from_uid, 789);
        assert_eq!(evt.amount, "88");
        assert_eq!(evt.room_sum_amount, "188");
    }
}

fn decrypt_group_attachment_key(
    crypto: &crate::crypto::CryptoEngine,
    group_id: &str,
    attachment_key: &str,
) -> Option<String> {
    let raw = attachment_key.trim();
    if raw.is_empty() {
        return None;
    }

    let data = hex::decode(raw).ok()?;
    let plain = crypto.decrypt_group_message(group_id, &data).ok()?;
    String::from_utf8(plain)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn decrypt_channel_attachment_key(
    crypto: &crate::crypto::CryptoEngine,
    channel_id: &str,
    attachment_key: &str,
) -> Option<String> {
    let raw = attachment_key.trim();
    if raw.is_empty() {
        return None;
    }

    let data = hex::decode(raw).ok()?;
    let plain = crypto.decrypt_channel_message(channel_id, &data).ok()?;
    String::from_utf8(plain)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn decrypt_friend_attachment_key(
    crypto: &crate::crypto::CryptoEngine,
    friend_id: &str,
    version: i64,
    source: &str,
    attachment_key: &str,
) -> Option<String> {
    let raw = attachment_key.trim();
    if raw.is_empty() {
        return None;
    }

    let data = hex::decode(raw).ok()?;
    let mut sources = vec![source];
    // 私聊图片正文候选和 attachmentKey 偶尔会落在不同端字段，先按正文 source 试，再兼容另一端。
    if source == "web" {
        sources.push("app");
    } else if source == "app" {
        sources.push("web");
    }

    for src in sources {
        let decrypted = crypto
            .decrypt_friend_message(friend_id, version, src, &data)
            .or_else(|_| {
                // 服务端回推可能带旧版本号；指定版本解不开时，用该端最新 key 再试一次。
                let key = crypto
                    .get_latest_friend_key(friend_id, src)
                    .ok_or(crate::crypto::CryptoError::KeyNotFound)?;
                crate::crypto::aes::decrypt_message(&data, &key)
            });
        let Some(file_key) = decrypted
            .ok()
            .and_then(|plain| String::from_utf8(plain).ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
        else {
            continue;
        };
        return Some(file_key);
    }

    None
}

fn fallback_plain_file_key(attachment_key: &str) -> Option<String> {
    let raw = attachment_key.trim();
    if raw.is_empty() {
        return None;
    }
    if raw.len() <= 32 || !raw.chars().all(|c| c.is_ascii_hexdigit()) {
        return Some(raw.to_string());
    }
    None
}

/// 20201 `SendGroupMessageResp` 解出来后派发到前端的结构。
/// 与老 im `fnMsgSendSuccess(msg, 'group')` 的入参字段对齐：
/// - `flag`          客户端自定义 id，对应本地 `Message.custom_msg_id`
/// - `msgId`         服务端下发的真实群消息 id
/// - `groupId`       所属群 id
/// - `sentOverTime`  服务端完成时间（毫秒）
#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MsgSentEvent {
    pub flag: i64,
    pub msg_id: i64,
    pub group_id: i64,
    pub sent_over_time: i64,
    /// 方便前端直接定位到会话：`"{type}_{targetId}"`，目前只会是 `"1_{groupId}"`。
    pub conversation_id: String,
}

/// 29999 错误回执事件：用于终端定位错误码，也用于把本地 sending 状态改成 failed。
#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MsgSendFailedEvent {
    pub flag: i64,
    pub target_id: i64,
    pub message_protocol_id: i32,
    pub err_code: i32,
    pub err_msg: String,
    pub conversation_id: String,
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MsgReadReceiptEvent {
    pub msg_id: i64,
    pub send_uid: i64,
    pub target_id: i64,
    pub status: i32,
    pub read_time: i64,
    pub snapchat_time: i32,
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GroupMsgReadReceiptEvent {
    pub msg_id: i64,
    pub group_id: i64,
    pub send_uid: i64,
    pub status: i32,
    pub read_time: i64,
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChannelReadReceiptEvent {
    pub msg_id: i64,
    pub total: i32,
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChannelReadReceiptPushEvent {
    pub channel_id: i64,
    pub read_channel_messages: Vec<ChannelReadReceiptEvent>,
}

#[derive(Debug, serde::Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GroupLiveSendGiftEvent {
    /// 2217 原始协议字段透传给前端，前端只负责按当前会话判断是否展示临时气泡。
    pub group_id: i64,
    pub live_room_id: i64,
    pub gift_id: i64,
    pub gift_type: i32,
    pub animation_url: String,
    pub sound_url: String,
    pub gift_name: String,
    pub quantity: i32,
    pub icon_url: String,
    pub from_uid: i64,
    pub anchor_uid: i64,
    pub coin_name: String,
    pub amount: String,
    pub room_sum_amount: String,
}

pub struct MessageBatcher {
    buffer: Vec<DecodedMessage>,
    last_flush: Instant,
    app_handle: AppHandle,
    aes_key: String,
    uid: String,
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ForceLogoutEvent {
    cmd: u16,
    reason: String,
    kick_type: i32,
}

impl MessageBatcher {
    pub fn flush_interval() -> Duration {
        Duration::from_millis(FLUSH_INTERVAL_MS)
    }

    pub fn new(app_handle: AppHandle, aes_key: String, uid: String) -> Self {
        Self {
            buffer: Vec::with_capacity(MAX_BATCH_SIZE),
            last_flush: Instant::now(),
            app_handle,
            aes_key,
            uid,
        }
    }

    pub async fn push(&mut self, frame: Vec<u8>) {
        if frame.len() < 16 {
            return;
        }

        // 读帧头。老 im `initHeader` 输出格式：
        // [0]  isJM   是否加密（1 加密 / 0 明文）
        // [1]  isZip  是否压缩
        // [2-3] cmd
        // [4-7] payload length
        // [8-15] msgId (i64 BE，老 im `msgId` / 发送请求时 flag 也放这里)
        let is_encrypted = frame[0];
        let cmd = u16::from_be_bytes([frame[2], frame[3]]);
        let payload_start = 16usize;
        if frame.len() < payload_start {
            return;
        }
        let payload = &frame[payload_start..];
        if matches!(
            cmd,
            cmds::CHANNEL_MSG_SENT
                | cmds::CHANNEL_MSG_RECEIVED
                | cmds::CHANNEL_EVENT_PUSH
                | cmds::CHANNEL_READ_PUSH
        ) {
            info!(
                "[channel] WS frame received cmd={} encrypted={} payload_len={}",
                cmd,
                is_encrypted,
                payload.len()
            );
        }
        let decoded_payload = if is_encrypted == 0x01 {
            match crypto::aes::decrypt_transport(payload, &self.aes_key) {
                Ok(d) => d,
                Err(e) => {
                    error!("AES decrypt cmd={} failed: {}", cmd, e);
                    return;
                }
            }
        } else {
            payload.to_vec()
        };

        match cmd {
            cmds::HEARTBEAT_RESP => {
                // 29901 心跳回包不参与消息批处理。
                return;
            }
            cmds::LOGOUT_RESP | cmds::FORCE_LOGOUT => {
                self.emit_force_logout(cmd, &decoded_payload);
                return;
            }
            // 20201 是群消息发送回执。老 im UI 状态从"发送中"升级为"已发送"。
            // 这里直接 emit，不进批处理：回执本来就是一条一条的、并且需要
            // 尽快驱动 UI。
            cmds::GROUP_MSG_SENT => {
                if let Err(e) = self.emit_group_msg_sent(&decoded_payload) {
                    error!("20201 decode/emit failed: {}", e);
                }
                return;
            }
            cmds::PRIVATE_MSG_SENT => {
                if let Err(e) = self.emit_private_msg_sent(&decoded_payload) {
                    error!("20101 decode/emit failed: {}", e);
                }
                return;
            }
            cmds::CHANNEL_MSG_SENT => {
                if let Err(e) = self.emit_channel_msg_sent(&decoded_payload) {
                    error!("[channel] 4201 decode/emit failed: {}", e);
                }
                return;
            }
            cmds::ERROR_RESP => {
                if let Err(e) = self.emit_error_resp(&decoded_payload) {
                    error!("29999 decode/emit failed: {}", e);
                }
                return;
            }
            cmds::RECEIPT_PUSH => {
                if let Err(e) = self.emit_receipt_push(&decoded_payload) {
                    error!("20104 decode/emit failed: {}", e);
                }
                return;
            }
            cmds::GROUP_READ_RECEIPT_PUSH => {
                if let Err(e) = self.emit_group_read_receipt_push(&decoded_payload) {
                    error!("20403 decode/emit failed: {}", e);
                }
                return;
            }
            cmds::CHANNEL_READ_PUSH => {
                if let Err(e) = self.emit_channel_read_push(&decoded_payload) {
                    error!("[channel] 4206 decode/emit failed: {}", e);
                }
                return;
            }
            cmds::GROUP_LIVE_SEND_GIFT_PUSH => {
                // 2217 是群直播打赏提示，对齐旧 im：只通知前端展示临时气泡，不入库也不更新会话列表。
                if let Err(e) = self.emit_group_live_send_gift(&decoded_payload) {
                    warn!("2217 decode/emit group live gift failed: {}", e);
                }
                return;
            }
            cmds::PRIVATE_MSG_RECALLED => {
                match imweb::PushRecallOneToOneMessageResp::decode(decoded_payload.as_slice()) {
                    Ok(resp) => {
                        for item in resp.recall_one_to_one_messages {
                            self.emit_recall_message("friend", item);
                        }
                    }
                    Err(e) => warn!("decode PRIVATE_MSG_RECALLED failed: {}", e),
                }
                return;
            }
            cmds::GROUP_MSG_RECALLED => {
                match imweb::PushRecallGroupMessageResp::decode(decoded_payload.as_slice()) {
                    Ok(resp) => {
                        for item in resp.recall_group_messages {
                            self.emit_recall_message("group", item);
                        }
                    }
                    Err(e) => warn!("decode GROUP_MSG_RECALLED failed: {}", e),
                }
                return;
            }
            cmds::CHANNEL_MSG_RECALLED => {
                match imweb::PushRecallChannelMessage::decode(decoded_payload.as_slice()) {
                    Ok(resp) => {
                        if let Some(item) = resp.latest_recall_channel_message {
                            self.emit_recall_message("channel", item);
                        }
                    }
                    Err(e) => warn!("decode CHANNEL_MSG_RECALLED failed: {}", e),
                }
                return;
            }
            cmds::FRIEND_REQ_NUM_PUSH => {
                match imweb::PushFriendReqNumResp::decode(decoded_payload.as_slice()) {
                    Ok(resp) => {
                        let total = resp.friend_req_num.max(0);
                        let _ = self
                            .app_handle
                            .emit("friend:req-num", serde_json::json!({ "total": total }));
                        info!("FRIEND_REQ_NUM_PUSH emitted total={}", total);
                    }
                    Err(e) => {
                        warn!("decode PushFriendReqNumResp: {}", e);
                    }
                }
                return;
            }
            cmds::SENSITIVE_WORDS_PUSH => {
                // 对齐旧 im：30001 只作为刷新信号，前端收到后重新拉 getChatSensitive 全量列表。
                let _ = self.app_handle.emit(
                    "chat-sensitive:updated",
                    serde_json::json!({ "cmd": cmds::SENSITIVE_WORDS_PUSH }),
                );
                info!("SENSITIVE_WORDS_PUSH emitted refresh signal");
                return;
            }
            cmds::FRIEND_RECORD_PUSH => {
                match self.decode_friend_record_push(&decoded_payload) {
                    Ok(mut msgs) => {
                        info!(
                            "FRIEND_RECORD_PUSH decoded system messages count={}",
                            msgs.len()
                        );
                        self.buffer.append(&mut msgs);
                        if self.buffer.len() >= MAX_BATCH_SIZE
                            || self.last_flush.elapsed() >= Duration::from_millis(FLUSH_INTERVAL_MS)
                        {
                            self.flush().await;
                        }
                    }
                    Err(e) => {
                        warn!("decode FRIEND_RECORD_PUSH failed: {}", e);
                    }
                }
                return;
            }
            // 20601 用户上下线推送（与 im `PushUserOnOrOffLineMessageResp` 一致）
            cmds::USER_ONLINE_STATUS_PUSH => {
                match imweb::PushUserOnOrOffLineMessageResp::decode(decoded_payload.as_slice()) {
                    Ok(resp) => {
                        let list: Vec<serde_json::Value> = resp
                            .users
                            .iter()
                            .map(|u| {
                                serde_json::json!({
                                    "uid": u.uid.to_string(),
                                    "online": u.online,
                                    "createTime": u.create_time,
                                    "bfShow": u.bf_show,
                                })
                            })
                            .collect();
                        let _ = self.app_handle.emit("user:online-status", &list);
                        info!("USER_ONLINE_STATUS_PUSH emitted users={}", resp.users.len());
                    }
                    Err(e) => {
                        warn!("decode PushUserOnOrOffLineMessageResp: {}", e);
                    }
                }
                return;
            }
            // 20202 是群消息下行推送。需要解出 conversation_id 才能进入前端列表。
            cmds::GROUP_MSG_RECEIVED => {
                match self.decode_group_msg_received(&decoded_payload) {
                    Ok(mut msgs) => {
                        let flush_now = has_dice_result_message(&msgs);
                        self.buffer.append(&mut msgs);
                        if flush_now
                            || self.buffer.len() >= MAX_BATCH_SIZE
                            || self.last_flush.elapsed() >= Duration::from_millis(FLUSH_INTERVAL_MS)
                        {
                            self.flush().await;
                        }
                    }
                    Err(e) => {
                        warn!("decode GROUP_MSG_RECEIVED failed: {}", e);
                    }
                }
                return;
            }
            cmds::PRIVATE_MSG_RECEIVED => {
                match self.decode_private_msg_received(&decoded_payload) {
                    Ok(mut msgs) => {
                        let flush_now = has_dice_result_message(&msgs);
                        self.buffer.append(&mut msgs);
                        if flush_now
                            || self.buffer.len() >= MAX_BATCH_SIZE
                            || self.last_flush.elapsed() >= Duration::from_millis(FLUSH_INTERVAL_MS)
                        {
                            self.flush().await;
                        }
                    }
                    Err(e) => {
                        warn!("decode PRIVATE_MSG_RECEIVED failed: {}", e);
                    }
                }
                return;
            }
            cmds::CHANNEL_MSG_RECEIVED => {
                match self.decode_channel_msg_received(&decoded_payload) {
                    Ok(mut msgs) => {
                        info!(
                            "[channel] CHANNEL_MSG_RECEIVED decoded count={}",
                            msgs.len()
                        );
                        self.buffer.append(&mut msgs);
                        if self.buffer.len() >= MAX_BATCH_SIZE
                            || self.last_flush.elapsed() >= Duration::from_millis(FLUSH_INTERVAL_MS)
                        {
                            self.flush().await;
                        }
                    }
                    Err(e) => {
                        warn!("[channel] decode CHANNEL_MSG_RECEIVED failed: {}", e);
                    }
                }
                return;
            }
            cmds::CHANNEL_EVENT_PUSH => {
                match self.decode_channel_event_push(&decoded_payload) {
                    Ok(mut msgs) => {
                        info!(
                            "[channel] CHANNEL_EVENT_PUSH decoded notice count={}",
                            msgs.len()
                        );
                        self.buffer.append(&mut msgs);
                        if self.buffer.len() >= MAX_BATCH_SIZE
                            || self.last_flush.elapsed() >= Duration::from_millis(FLUSH_INTERVAL_MS)
                        {
                            self.flush().await;
                        }
                    }
                    Err(e) => {
                        warn!("[channel] decode CHANNEL_EVENT_PUSH failed: {}", e);
                    }
                }
                return;
            }
            // 20701 群事件：邀请入群、成员加入/退出、群信息变更等。
            // 老 im 会把其中的 groupReqEventMsgDto 写成群内系统提示，例如
            // “你邀请 185... 加入群聊”。这里转成 msgType=8 的系统消息走同一条 msg:batch 链路。
            cmds::GROUP_EVENT_PUSH => {
                match self.decode_group_event_push(&decoded_payload) {
                    Ok(mut msgs) => {
                        info!(
                            "GROUP_EVENT_PUSH decoded system messages count={}",
                            msgs.len()
                        );
                        self.buffer.append(&mut msgs);
                        if self.buffer.len() >= MAX_BATCH_SIZE
                            || self.last_flush.elapsed() >= Duration::from_millis(FLUSH_INTERVAL_MS)
                        {
                            self.flush().await;
                        }
                    }
                    Err(e) => {
                        warn!("decode GROUP_EVENT_PUSH failed: {}", e);
                    }
                }
                return;
            }
            cmds::KEY_PAIR_CHANGE_PUSH => {
                if let Err(e) = self.handle_key_pair_change(&decoded_payload) {
                    warn!("decode KEY_PAIR_CHANGE_PUSH failed: {}", e);
                }
                return;
            }
            // 20401/20402 是“群通知/入群申请”入口；对齐老 im，落到群通知伪会话。
            cmds::GROUP_REQ_NUM_PUSH => {
                match self.decode_group_req_num_push(&decoded_payload) {
                    Ok(mut msgs) => {
                        self.buffer.append(&mut msgs);
                        if self.buffer.len() >= MAX_BATCH_SIZE
                            || self.last_flush.elapsed() >= Duration::from_millis(FLUSH_INTERVAL_MS)
                        {
                            self.flush().await;
                        }
                    }
                    Err(e) => {
                        warn!("decode GROUP_REQ_NUM_PUSH failed: {}", e);
                    }
                }
                return;
            }
            cmds::GROUP_REQ_MSG_PUSH => {
                match self.decode_group_req_msg_push(&decoded_payload) {
                    Ok(mut msgs) => {
                        self.buffer.append(&mut msgs);
                        if self.buffer.len() >= MAX_BATCH_SIZE
                            || self.last_flush.elapsed() >= Duration::from_millis(FLUSH_INTERVAL_MS)
                        {
                            self.flush().await;
                        }
                    }
                    Err(e) => {
                        warn!("decode GROUP_REQ_MSG_PUSH failed: {}", e);
                    }
                }
                return;
            }
            // 登录回执不是聊天正文，不进消息列表，避免干扰日志与 UI。
            cmds::LOGIN_RESP => {
                return;
            }
            // 其余命令先保留老逻辑，走批处理（后续补上对应 proto 解码）。
            _ => {}
        }

        match decode_by_cmd(cmd, &decoded_payload) {
            Ok(msg) => {
                if msg.conversation_id.trim().is_empty() {
                    warn!(
                        "drop decoded msg with empty conversation_id, cmd={}, msg_id={}",
                        msg.cmd, msg.msg_id
                    );
                    return;
                }
                self.buffer.push(msg);
            }
            Err(e) => {
                warn!("decode cmd={} failed: {}", cmd, e);
                return;
            }
        }

        if self.buffer.len() >= MAX_BATCH_SIZE
            || self.last_flush.elapsed() >= Duration::from_millis(FLUSH_INTERVAL_MS)
        {
            self.flush().await;
        }
    }

    pub async fn flush_if_due(&mut self) {
        if !self.buffer.is_empty() {
            self.flush().await;
        }
    }

    fn emit_force_logout(&self, cmd: u16, payload: &[u8]) {
        let (reason, kick_type) = if cmd == cmds::FORCE_LOGOUT {
            match im::PushKickUserMessage::decode(payload) {
                Ok(resp) => {
                    let tip = resp.kick_user_tip;
                    let reason = tip
                        .as_ref()
                        .map(|item| item.tip.trim().to_string())
                        .filter(|text: &String| !text.is_empty())
                        .unwrap_or_else(|| "账号已在其他设备登录".to_string());
                    let kick_type = tip.as_ref().map(|item| item.kick_type).unwrap_or(0);
                    (reason, kick_type)
                }
                Err(e) => {
                    warn!("decode FORCE_LOGOUT PushKickUserMessage failed: {}", e);
                    ("账号已在其他设备登录".to_string(), 0)
                }
            }
        } else {
            ("退出登录".to_string(), 0)
        };

        warn!(
            "WS force logout received cmd={} kick_type={} reason={}",
            cmd, kick_type, reason
        );
        let _ = self.app_handle.emit(
            "auth:force-logout",
            ForceLogoutEvent {
                cmd,
                reason,
                kick_type,
            },
        );
        let _ = self.app_handle.emit("ws:status", "disconnected");
    }

    fn decode_group_msg_received(&self, payload: &[u8]) -> Result<Vec<DecodedMessage>, String> {
        let resp = imweb::PushGroupMessageResp::decode(payload)
            .map_err(|e| format!("decode PushGroupMessageResp: {}", e))?;
        let crypto = self.app_handle.state::<crate::crypto::CryptoEngine>();

        let mut out = Vec::with_capacity(resp.group_msg.len());
        for gm in resp.group_msg {
            let group_id = gm.group_id;
            let group_id_s = group_id.to_string();
            let conversation_id = format!("1_{}", group_id);
            let key_cached = crypto.get_group_key(&group_id_s).is_some();
            if gm.msg_type == 2 {
                info!(
                    target: "group-audio",
                    "GROUP_MSG_RECEIVED audio packet group_id={} msg_id={} sender_uid={} cipher_len={} version={} key_cached={} attachment_key_len={}",
                    group_id,
                    gm.msg_id,
                    gm.send_uid,
                    gm.content.len(),
                    gm.version,
                    key_cached,
                    gm.attachment_key.len(),
                );
            }
            // 和私聊一致：解密失败时除了给一个占位文案，还要带上 cipherHex +
            // decryptPending，让前端 `msg:batch` 监听到后可以 ensureGroupRelKey
            // 再走一次 `decrypt_group_incoming` 重试，从而彻底消除"表情/文本首
            // 条消息在 key warmup 之前到达时被永久卡住在 [加密消息，等待密钥
            // 同步]"的现象。
            let (content, decrypt_pending, group_notice_meta) = match crypto
                .decrypt_group_message(&group_id_s, &gm.content)
            {
                Ok(plain) => (
                    decode_content_obj(gm.msg_type, plain.as_slice()),
                    false,
                    group_notice_meta_from_plain(gm.msg_type, plain.as_slice()),
                ),
                Err(e) => {
                    // 兼容老客户端发来的明文消息（例如版本=0 或骰子/扑克等未加密类型）
                    if gm.msg_type == 7 && imweb::FileObj::decode(gm.content.as_slice()).is_ok() {
                        warn!(
                                "GROUP_MSG_RECEIVED decrypt failed but raw FileObj parsed group_id={} msg_id={} msg_type={} err={}",
                                group_id, gm.msg_id, gm.msg_type, e
                            );
                        (
                            decode_content_obj(gm.msg_type, gm.content.as_slice()),
                            false,
                            None,
                        )
                    } else if gm.msg_type == 8
                        && imweb::GroupNoticeObj::decode(gm.content.as_slice()).is_ok()
                    {
                        warn!(
                                "GROUP_MSG_RECEIVED decrypt failed but raw GroupNoticeObj parsed group_id={} msg_id={} msg_type={} err={}",
                                group_id, gm.msg_id, gm.msg_type, e
                            );
                        (
                            decode_content_obj(gm.msg_type, gm.content.as_slice()),
                            false,
                            group_notice_meta_from_plain(gm.msg_type, gm.content.as_slice()),
                        )
                    } else if let Ok(obj) = imweb::TextObj::decode(gm.content.as_slice()) {
                        warn!(
                                "GROUP_MSG_RECEIVED decrypt failed but raw TextObj parsed group_id={} msg_id={} msg_type={} err={}",
                                group_id, gm.msg_id, gm.msg_type, e
                            );
                        (obj.content, false, None)
                    } else if gm.msg_type == 1
                        && imweb::ImageObj::decode(gm.content.as_slice()).is_ok()
                    {
                        warn!(
                                "GROUP_MSG_RECEIVED decrypt failed but raw ImageObj parsed group_id={} msg_id={} msg_type={} err={}",
                                group_id, gm.msg_id, gm.msg_type, e
                            );
                        (
                            decode_content_obj(gm.msg_type, gm.content.as_slice()),
                            false,
                            None,
                        )
                    } else if gm.msg_type == 9
                        && imweb::DynamicImageObj::decode(gm.content.as_slice()).is_ok()
                    {
                        warn!(
                                "GROUP_MSG_RECEIVED decrypt failed but raw DynamicImageObj parsed group_id={} msg_id={} msg_type={} err={}",
                                group_id, gm.msg_id, gm.msg_type, e
                            );
                        (
                            decode_content_obj(gm.msg_type, gm.content.as_slice()),
                            false,
                            None,
                        )
                    } else if gm.msg_type == 2
                        && imweb::AudioObj::decode(gm.content.as_slice()).is_ok()
                    {
                        warn!(
                                "GROUP_MSG_RECEIVED decrypt failed but raw AudioObj parsed group_id={} msg_id={} msg_type={} err={}",
                                group_id, gm.msg_id, gm.msg_type, e
                            );
                        (
                            decode_content_obj(gm.msg_type, gm.content.as_slice()),
                            false,
                            None,
                        )
                    } else if gm.msg_type == 3
                        && imweb::VideoObj::decode(gm.content.as_slice()).is_ok()
                    {
                        warn!(
                                "GROUP_MSG_RECEIVED decrypt failed but raw VideoObj parsed group_id={} msg_id={} msg_type={} err={}",
                                group_id, gm.msg_id, gm.msg_type, e
                            );
                        (
                            decode_content_obj(gm.msg_type, gm.content.as_slice()),
                            false,
                            None,
                        )
                    } else if gm.msg_type == 5
                        && imweb::NameCardObj::decode(gm.content.as_slice()).is_ok()
                    {
                        warn!(
                                "GROUP_MSG_RECEIVED decrypt failed but raw NameCardObj parsed group_id={} msg_id={} msg_type={} err={}",
                                group_id, gm.msg_id, gm.msg_type, e
                            );
                        (
                            decode_content_obj(gm.msg_type, gm.content.as_slice()),
                            false,
                            None,
                        )
                    } else if gm.msg_type == 12
                        && imweb::SetImageObj::decode(gm.content.as_slice()).is_ok()
                    {
                        warn!(
                                "GROUP_MSG_RECEIVED decrypt failed but raw SetImageObj parsed group_id={} msg_id={} msg_type={} err={}",
                                group_id, gm.msg_id, gm.msg_type, e
                            );
                        (
                            decode_content_obj(gm.msg_type, gm.content.as_slice()),
                            false,
                            None,
                        )
                    } else if gm.msg_type == 18
                        && imweb::AnimatedGameObj::decode(gm.content.as_slice()).is_ok()
                    {
                        warn!(
                                "GROUP_MSG_RECEIVED decrypt failed but raw AnimatedGameObj parsed group_id={} msg_id={} msg_type={} err={}",
                                group_id, gm.msg_id, gm.msg_type, e
                            );
                        (
                            decode_content_obj(gm.msg_type, gm.content.as_slice()),
                            false,
                            None,
                        )
                    } else if let Ok(s) = String::from_utf8(gm.content.clone()) {
                        warn!(
                                "GROUP_MSG_RECEIVED decrypt failed but raw UTF-8 parsed group_id={} msg_id={} msg_type={} err={}",
                                group_id, gm.msg_id, gm.msg_type, e
                            );
                        (s, false, None)
                    } else {
                        warn!(
                                "GROUP_MSG_RECEIVED decrypt failed group_id={} msg_id={} msg_type={} cipher_len={} version={} key_cached={} err={}",
                                group_id,
                                gm.msg_id,
                                gm.msg_type,
                                gm.content.len(),
                                gm.version,
                                key_cached,
                                e
                            );
                        ("[加密消息，等待密钥同步]".to_string(), true, None)
                    }
                }
            };
            info!(
                "GROUP_MSG_RECEIVED group_id={} msg_id={} sender_uid={} msg_type={} conversation_id={} decrypt_pending={}",
                group_id,
                gm.msg_id,
                gm.send_uid,
                gm.msg_type,
                conversation_id,
                decrypt_pending,
            );
            let file_key = decrypt_group_attachment_key(&crypto, &group_id_s, &gm.attachment_key)
                .or_else(|| fallback_plain_file_key(&gm.attachment_key));
            if gm.msg_type == 2 {
                info!(
                    target: "group-audio",
                    "GROUP_MSG_RECEIVED audio decoded group_id={} msg_id={} decrypt_pending={} content_head={} file_key_len={} attachment_key_head={}",
                    group_id,
                    gm.msg_id,
                    decrypt_pending,
                    content.chars().take(160).collect::<String>(),
                    file_key.as_deref().unwrap_or("").len(),
                    gm.attachment_key.chars().take(24).collect::<String>(),
                );
            }
            let mut extra = serde_json::json!({
                "groupId": group_id,
                "version": gm.version,
                "contentMd5": gm.content_md5,
                "snapchatTime": gm.snapchat_time,
                "deleteSeconds": if gm.snapchat_time > 0 { i64::from(gm.snapchat_time) * 1000 } else { 0 },
                "decryptPending": decrypt_pending,
                "cipherHex": hex::encode(&gm.content),
                "attachmentKey": gm.attachment_key,
                "fileKey": file_key,
            });
            if let Some(map) = extra.as_object_mut() {
                // 对齐旧 im：@ 点击优先依赖服务端协议里的 atUids/atUsers，而不是只按显示名猜成员。
                if !gm.at_uids.is_empty() {
                    map.insert(
                        "atUids".to_string(),
                        serde_json::Value::Array(
                            gm.at_uids
                                .iter()
                                .map(|uid| serde_json::Value::from(*uid))
                                .collect(),
                        ),
                    );
                }
                if !gm.at_users.is_empty() {
                    map.insert(
                        "atUsers".to_string(),
                        serde_json::Value::Array(
                            gm.at_users
                                .iter()
                                .map(|user| {
                                    serde_json::json!({
                                        "uid": user.uid.to_string(),
                                        "id": user.uid.to_string(),
                                        "userId": user.uid.to_string(),
                                        "nickName": user.nick_name,
                                        "nickname": user.nick_name,
                                        "name": user.friend_relation.as_ref().map(|relation| relation.remark_name.clone()).unwrap_or_default(),
                                    })
                                })
                                .collect(),
                        ),
                    );
                }
                if let Some(send_member) = gm.send_member.as_ref() {
                    let member_json = group_member_to_json(send_member);
                    map.insert("sendMember".to_string(), member_json);
                    if let Some(user) = send_member.user.as_ref() {
                        map.insert("user".to_string(), user_base_to_json(user));
                        let nick = user.nick_name.trim();
                        if !nick.is_empty() {
                            map.insert(
                                "senderName".to_string(),
                                serde_json::Value::String(nick.to_string()),
                            );
                        }
                        let icon = user.icon.trim();
                        if !icon.is_empty() {
                            map.insert(
                                "senderAvatar".to_string(),
                                serde_json::Value::String(icon.to_string()),
                            );
                        }
                    }
                }
            }
            if let Some((notice_id, show_notify)) = group_notice_meta {
                if let Some(map) = extra.as_object_mut() {
                    map.insert("noticeId".to_string(), serde_json::Value::from(notice_id));
                    map.insert(
                        "showNotify".to_string(),
                        serde_json::Value::from(show_notify),
                    );
                    map.insert("bfAll".to_string(), serde_json::Value::from(show_notify));
                    map.insert("isHide".to_string(), serde_json::Value::from(!show_notify));
                }
            }

            out.push(DecodedMessage {
                cmd: cmds::GROUP_MSG_RECEIVED,
                msg_id: gm.msg_id.to_string(),
                conversation_id,
                sender_id: gm.send_uid.to_string(),
                msg_type: gm.msg_type,
                content,
                send_time: gm.send_time,
                status: 1,
                read_status: 0,
                extra,
            });
        }
        Ok(out)
    }

    fn decode_group_event_push(&self, payload: &[u8]) -> Result<Vec<DecodedMessage>, String> {
        let resp = imweb::PushGroupEventMessage::decode(payload)
            .map_err(|e| format!("decode PushGroupEventMessage: {}", e))?;
        let mut out = Vec::new();

        for item in resp.group_req_event_msg_dto {
            let Some(common) = item.common_msg_dto.as_ref() else {
                continue;
            };
            let Some(group) = common.group_base_info.as_ref() else {
                continue;
            };
            // 创群/初始化类事件有时没有服务端 msgId；旧 im 仍会写入本地提示，
            // 这里不能因为 msgId 为 0 直接丢掉，否则“邀请加入群聊”系统提示不显示。
            if group.group_id <= 0 {
                continue;
            }

            let mut content = group_event_content(&item, common);
            if should_hide_group_remove_notice_for_current_user(&item, self.uid.trim()) {
                // 对齐旧 im：踢人事件只给操作者和被移除本人展示，群主/管理员之间不互相弹可见提示。
                content = "群聊事件".to_string();
            }
            if content.trim().is_empty() {
                continue;
            }

            let group_id_str = group.group_id.to_string();
            let conversation_id = if group_req_event_goes_to_invitation_only(&item) {
                "1_invitation".to_string()
            } else {
                format!("1_{}", group.group_id)
            };

            let notice_msg_id = group_req_event_notice_message_id(&item, common, group.group_id);
            out.push(DecodedMessage {
                cmd: cmds::GROUP_EVENT_PUSH,
                msg_id: notice_msg_id.clone(),
                conversation_id,
                sender_id: item.from_uid.to_string(),
                msg_type: 8,
                content,
                send_time: normalize_timestamp(common.update_time),
                status: 1,
                read_status: 0,
                extra: serde_json::json!({
                    "source": "group-event",
                    "groupId": group_id_str,
                    "groupName": group.group_name,
                    "groupAvatar": group.pic,
                    "groupMuted": group.group_shutup,
                    // 对齐旧 im：群事件携带阅后即焚状态，前端据此立即切换聊天背景。
                    "groupReadCancel": group.group_read_cancel,
                    "groupMsgCancelTime": group.group_msg_cancel_time,
                    "memberCount": item.group_member.len(),
                    "members": item.group_member.iter().map(group_member_to_json).collect::<Vec<_>>(),
                    "groupReqType": item.group_req_type,
                    "groupReqStatus": item.group_req_status,
                    "eventType": common.even_type,
                    "groupEventMsgId": common.msg_id.to_string(),
                    "groupMsgType": common.msg_type,
                    "receiveUid": item.receive_uid.to_string(),
                    "fromUid": item.from_uid.to_string(),
                    "checkUid": item.check_uid.to_string(),
                    "notificationIdentity": notice_msg_id,
                }),
            });

            if let Some(notification) =
                group_admin_change_invitation_message(&item, common, group, self.uid.trim())
            {
                out.push(notification);
            }
        }

        for item in resp.group_update_event_msg_dto {
            let Some(common) = item.common_msg_dto.as_ref() else {
                continue;
            };
            let Some(group) = common.group_base_info.as_ref() else {
                continue;
            };
            if group.group_id <= 0 || common.msg_id <= 0 || common.msg.trim().is_empty() {
                continue;
            }

            out.push(DecodedMessage {
                cmd: cmds::GROUP_EVENT_PUSH,
                msg_id: common.msg_id.to_string(),
                conversation_id: format!("1_{}", group.group_id),
                sender_id: item.from_uid.to_string(),
                msg_type: 8,
                content: common.msg.trim().to_string(),
                send_time: normalize_timestamp(common.update_time),
                status: 1,
                read_status: 0,
                extra: serde_json::json!({
                    "source": "group-update-event",
                    "groupId": group.group_id.to_string(),
                    "groupName": group.group_name,
                    "groupAvatar": group.pic,
                    "groupMuted": group.group_shutup,
                    // 对齐旧 im：群配置更新后当前会话要立即显示/隐藏阅后即焚背景。
                    "groupReadCancel": group.group_read_cancel,
                    "groupMsgCancelTime": group.group_msg_cancel_time,
                    "memberCount": item.group_member.len(),
                    "members": item.group_member.iter().map(group_member_to_json).collect::<Vec<_>>(),
                    "eventType": common.even_type,
                    "groupEventMsgId": common.msg_id.to_string(),
                    "groupMsgType": common.msg_type,
                    "handleType": item.handle_type,
                    "fromUid": item.from_uid.to_string(),
                }),
            });
        }

        Ok(out)
    }

    fn decode_group_req_num_push(&self, payload: &[u8]) -> Result<Vec<DecodedMessage>, String> {
        let resp = imweb::PushGroupReqNumResp::decode(payload)
            .map_err(|e| format!("decode PushGroupReqNumResp: {}", e))?;
        let Some(item) = resp.group_req_msg.as_ref() else {
            return Ok(Vec::new());
        };
        Ok(group_req_items_to_system_messages(
            cmds::GROUP_REQ_NUM_PUSH,
            std::slice::from_ref(item),
        ))
    }

    fn decode_group_req_msg_push(&self, payload: &[u8]) -> Result<Vec<DecodedMessage>, String> {
        let resp = imweb::PushGroupReqMessageResp::decode(payload)
            .map_err(|e| format!("decode PushGroupReqMessageResp: {}", e))?;
        Ok(group_req_items_to_system_messages(
            cmds::GROUP_REQ_MSG_PUSH,
            resp.group_req_msg.as_slice(),
        ))
    }

    fn decode_friend_record_push(&self, payload: &[u8]) -> Result<Vec<DecodedMessage>, String> {
        let resp = imweb::PushFriendRecordMessageResp::decode(payload)
            .map_err(|e| format!("decode PushFriendRecordMessageResp: {}", e))?;
        let mut out = Vec::new();

        for item in resp.friend_recordmsg {
            let Some(detail) = item.contacts_detail.as_ref() else {
                continue;
            };
            let Some(user) = detail.user_info.as_ref() else {
                continue;
            };
            let friend_id = if user.uid > 0 {
                user.uid
            } else if item.target_uid > 0 {
                item.target_uid
            } else if item.receive_uid > 0 {
                item.receive_uid
            } else {
                item.send_uid
            };
            if friend_id <= 0 {
                continue;
            }

            let do_type = item.do_type;
            let content = if do_type == imweb::FriendDoType::ReadCancel as i32 {
                let current_uid = self.uid.trim();
                // 对齐旧 im：当前账号自己修改阅后即焚时，推送文案显示“你”，不要显示好友备注名。
                let actor_name =
                    if !current_uid.is_empty() && item.send_uid.to_string() == current_uid {
                        "你".to_string()
                    } else {
                        friend_display_name(user)
                    };
                friend_read_cancel_tip(detail.msg_cancel_time, actor_name, detail.bf_read_cancel)
            } else if do_type == imweb::FriendDoType::AgreeJoinFriend as i32 {
                "我们已成为好友，打声招呼吧".to_string()
            } else {
                continue;
            };

            let send_time = normalize_timestamp(item.create_time);
            out.push(DecodedMessage {
                cmd: cmds::FRIEND_RECORD_PUSH,
                msg_id: format!(
                    "friend-record-{}-{}-{}-{}",
                    do_type, friend_id, item.send_uid, send_time
                ),
                conversation_id: format!("0_{}", friend_id),
                sender_id: item.send_uid.to_string(),
                msg_type: 8,
                content,
                send_time,
                status: 1,
                read_status: 0,
                extra: serde_json::json!({
                    "source": "friend-record",
                    "doType": do_type,
                    "friendId": friend_id.to_string(),
                    "receiveUid": item.receive_uid.to_string(),
                    "sendUid": item.send_uid.to_string(),
                    "targetUid": item.target_uid.to_string(),
                    "bfReadCancel": detail.bf_read_cancel,
                    "msgCancelTime": detail.msg_cancel_time,
                    "bfReadReceipt": detail.bf_read_receipt,
                    "letter": detail.letter.clone(),
                    "nickname": user.nick_name.clone(),
                    "avatar": user.icon.clone(),
                    "identify": user.identify.clone(),
                    "remark": user.friend_relation.as_ref().map(|r| r.remark_name.clone()).unwrap_or_default(),
                }),
            });
        }

        Ok(out)
    }

    fn decode_private_msg_received(&self, payload: &[u8]) -> Result<Vec<DecodedMessage>, String> {
        let resp = imweb::PushOneToOneMessageResp::decode(payload)
            .map_err(|e| format!("decode PushOneToOneMessageResp: {}", e))?;
        let Some(om) = resp.one_to_one_message else {
            return Ok(Vec::new());
        };

        let sender_id = om.send_uid.to_string();
        let receiver_id = om.receive_uid.to_string();
        let current_uid = self.uid.trim();
        let is_self = !current_uid.is_empty() && sender_id == current_uid;
        let peer_id = if is_self {
            receiver_id.clone()
        } else {
            sender_id.clone()
        };
        let crypto = self.app_handle.state::<crate::crypto::CryptoEngine>();
        // 对齐老 im `fnFriendMsgAdd`：
        // - 自己其他端同步来的消息落到 receiveUid 会话，使用 myselfWebContent。
        // - 好友发来的消息落到 sendUid 会话，使用 webContent。
        let conversation_id = format!("0_{}", peer_id);
        let ver = i64::from(om.version);

        let candidate_ids = vec![sender_id.clone()];
        let mut ciphertexts_to_try = Vec::new();
        let sender_source = if om.source == 1 { "web" } else { "app" };
        // 好友消息使用顶层 `version + source`；自己多端同步的
        // myself*Content 在旧 im 里按同账号 APP key 语义解密。
        // 同时保留顶层版本/source 作为兼容回退，覆盖已由旧包发出的消息。
        macro_rules! push_content_with {
            ($content:expr, $version:expr, $source:expr) => {{
                let content = $content;
                let version = $version;
                let source = $source;
                let attachment_key = if content.attachment_key.trim().is_empty() {
                    om.attachment_key.as_str()
                } else {
                    content.attachment_key.as_str()
                };
                if !ciphertexts_to_try
                    .iter()
                    .any(|(v, s, cipher, _): &(i64, &str, &[u8], &str)| {
                        *v == version && *s == source && *cipher == content.content.as_slice()
                    })
                {
                    ciphertexts_to_try.push((
                        version,
                        source,
                        content.content.as_slice(),
                        attachment_key,
                    ));
                }
            }};
        }
        if is_self {
            if let Some(mweb) = &om.myself_web_content {
                let content_ver = if mweb.version > 0 {
                    i64::from(mweb.version)
                } else {
                    ver
                };
                push_content_with!(mweb, content_ver, "app");
                push_content_with!(mweb, ver, sender_source);
            }
            if let Some(mapp) = &om.myself_app_content {
                let content_ver = if mapp.version > 0 {
                    i64::from(mapp.version)
                } else {
                    ver
                };
                push_content_with!(mapp, content_ver, "app");
                push_content_with!(mapp, ver, sender_source);
            }
        } else {
            if let Some(web) = &om.web_content {
                push_content_with!(web, ver, sender_source);
                // 手机与 PC 私聊图片存在顶层 source 与 webContent 实际加密端不一致的历史包；
                // 先保留服务端 source，再补同版本另一端候选，后续 protobuf/contentMd5 校验会过滤错 key。
                if sender_source == "app" {
                    push_content_with!(web, ver, "web");
                } else {
                    push_content_with!(web, ver, "app");
                }
                if web.version > 0 {
                    push_content_with!(web, i64::from(web.version), "web");
                }
            }
        }
        // Fallback for old/unencrypted messages that might still use `content`
        if !om.content.is_empty() {
            ciphertexts_to_try.push((
                ver,
                sender_source,
                om.content.as_slice(),
                om.attachment_key.as_str(),
            ));
        }
        let cipher_candidates: Vec<serde_json::Value> = ciphertexts_to_try
            .iter()
            .filter(|(_, _, cipher, _)| !cipher.is_empty())
            .map(|(version, source, cipher, attachment_key)| {
                serde_json::json!({
                    "version": *version,
                    "source": *source,
                    "cipherHex": hex::encode(*cipher),
                    "attachmentKey": attachment_key,
                })
            })
            .collect();
        let primary_cipher_hex = cipher_candidates
            .first()
            .and_then(|v| v.get("cipherHex"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        if om.msg_type == 12 || om.msg_type == 18 {
            let content = [
                om.app_content.as_ref().map(|v| v.content.as_slice()),
                if om.content.is_empty() {
                    None
                } else {
                    Some(om.content.as_slice())
                },
                om.web_content.as_ref().map(|v| v.content.as_slice()),
                om.myself_app_content.as_ref().map(|v| v.content.as_slice()),
                om.myself_web_content.as_ref().map(|v| v.content.as_slice()),
            ]
            .into_iter()
            .flatten()
            .find_map(|raw| {
                if om.msg_type == 12 {
                    decode_raw_set_image_content(raw)
                } else {
                    decode_raw_animated_game_content(raw)
                }
            });

            if let Some(content) = content {
                warn!(
                    target: "dice",
                    "[functional-message] PRIVATE_MSG_RECEIVED raw msg_type={} parsed sender_uid={} receive_uid={} msg_id={} content='{}'",
                    om.msg_type,
                    om.send_uid,
                    om.receive_uid,
                    om.msg_id,
                    content
                );
                return Ok(vec![DecodedMessage {
                    cmd: cmds::PRIVATE_MSG_RECEIVED,
                    msg_id: om.msg_id.to_string(),
                    conversation_id,
                    sender_id: om.send_uid.to_string(),
                    msg_type: om.msg_type,
                    content,
                    send_time: om.send_time,
                    status: 1,
                    read_status: 0,
                    extra: serde_json::json!({
                        "receiveUid": om.receive_uid,
                        "sendUid": om.send_uid,
                        "isSelfSync": is_self,
                        "version": om.version,
                        "source": sender_source,
                        "snapchatTime": om.snapchat_time,
                        "deleteSeconds": if om.snapchat_time > 0 { i64::from(om.snapchat_time) * 1000 } else { 0 },
                        "decryptPending": false,
                        "friendIdCandidates": candidate_ids,
                        "cipherHex": primary_cipher_hex,
                        "cipherCandidates": cipher_candidates,
                        "attachmentKey": om.attachment_key,
                    }),
                }]);
            }
        }

        let mut decrypted: Result<Vec<u8>, crate::crypto::CryptoError> =
            Err(crate::crypto::CryptoError::KeyNotFound);
        let mut fallback_err = None;
        let mut selected_attachment_key = String::new();
        let mut selected_file_key = None;

        'outer: for fid in &candidate_ids {
            for (v, source, cipher, attachment_key) in &ciphertexts_to_try {
                if cipher.is_empty() {
                    continue;
                }

                decrypted = crypto.decrypt_friend_message(fid, *v, source, cipher);

                if let Ok(plain) = &decrypted {
                    if !validate_plain_content(om.msg_type, plain, &om.content_md5) {
                        decrypted = Err(crate::crypto::CryptoError::AesError(
                            "decrypted private content failed validation".to_string(),
                        ));
                        continue;
                    }
                    selected_attachment_key = (*attachment_key).to_string();
                    selected_file_key =
                        decrypt_friend_attachment_key(&crypto, fid, *v, source, attachment_key)
                            .or_else(|| fallback_plain_file_key(attachment_key));
                    break 'outer;
                } else if let Err(e) = &decrypted {
                    // Keep the first actual AES error instead of KeyNotFound
                    if matches!(e, crate::crypto::CryptoError::AesError(_))
                        && fallback_err.is_none()
                    {
                        fallback_err = Some(crate::crypto::CryptoError::AesError(e.to_string()));
                    }
                }
            }
        }
        if decrypted.is_err() && fallback_err.is_some() {
            decrypted = Err(fallback_err.unwrap());
        }

        let mut decrypt_pending = false;
        let content = match decrypted {
            Ok(plain) => decode_content_obj(om.msg_type, plain.as_slice()),
            Err(e) => {
                // Determine which ciphertext to use for fallback parsing
                let fallback_cipher = ciphertexts_to_try
                    .first()
                    .map(|(_, _, c, _)| *c)
                    .unwrap_or(om.content.as_slice());
                let allow_plain_fallback = ver == 0 || ciphertexts_to_try.is_empty();

                if validate_plain_content(om.msg_type, fallback_cipher, &om.content_md5) {
                    // 兼容服务端只回外层明文 content、但仍带 version/source 的私聊消息；
                    // 先用 contentMd5 校验，避免把真正密文误当成明文。
                    warn!(
                        "PRIVATE_MSG_RECEIVED decrypt failed but raw plaintext validated sender_uid={} msg_id={} msg_type={} err={}",
                        om.send_uid, om.msg_id, om.msg_type, e
                    );
                    decode_content_obj(om.msg_type, fallback_cipher)
                } else if let Some(content) =
                    decode_private_raw_file_fallback(om.msg_type, fallback_cipher)
                {
                    // 旧端/服务端可能给带 version/source 的明文 FileObj；先解析文件协议，避免误入密钥等待占位。
                    warn!(
                        "[file-recv] PRIVATE_MSG_RECEIVED raw FileObj fallback sender_uid={} msg_id={} version={} source={} content_md5_len={} raw_len={} err={}",
                        om.send_uid,
                        om.msg_id,
                        om.version,
                        sender_source,
                        om.content_md5.len(),
                        fallback_cipher.len(),
                        e
                    );
                    content
                } else if !allow_plain_fallback {
                    decrypt_pending = true;
                    warn!(
                        "PRIVATE_MSG_RECEIVED encrypted decrypt failed sender_uid={} msg_id={} err={}",
                        om.send_uid, om.msg_id, e
                    );
                    "[加密消息，等待密钥同步]".to_string()
                } else if om.msg_type == 1 {
                    match imweb::ImageObj::decode(fallback_cipher) {
                        Ok(obj) => {
                            warn!(
                                "PRIVATE_MSG_RECEIVED decrypt failed but raw ImageObj parsed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            image_obj_to_json(obj)
                        }
                        Err(_) => {
                            decrypt_pending = true;
                            warn!(
                                "PRIVATE_MSG_RECEIVED image decrypt failed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            "[加密消息，等待密钥同步]".to_string()
                        }
                    }
                } else if om.msg_type == 9 {
                    match imweb::DynamicImageObj::decode(fallback_cipher) {
                        Ok(obj) => {
                            warn!(
                                "PRIVATE_MSG_RECEIVED decrypt failed but raw DynamicImageObj parsed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            dynamic_image_obj_to_json(obj)
                        }
                        Err(_) => {
                            decrypt_pending = true;
                            warn!(
                                "PRIVATE_MSG_RECEIVED dynamic image decrypt failed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            "[加密消息，等待密钥同步]".to_string()
                        }
                    }
                } else if om.msg_type == 2 {
                    match imweb::AudioObj::decode(fallback_cipher) {
                        Ok(obj) => {
                            warn!(
                                "PRIVATE_MSG_RECEIVED decrypt failed but raw AudioObj parsed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            audio_obj_to_json(obj)
                        }
                        Err(_) => {
                            decrypt_pending = true;
                            warn!(
                                "PRIVATE_MSG_RECEIVED audio decrypt failed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            "[加密消息，等待密钥同步]".to_string()
                        }
                    }
                } else if om.msg_type == 3 {
                    match imweb::VideoObj::decode(fallback_cipher) {
                        Ok(obj) => {
                            warn!(
                                "PRIVATE_MSG_RECEIVED decrypt failed but raw VideoObj parsed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            video_obj_to_json(obj)
                        }
                        Err(_) => {
                            decrypt_pending = true;
                            warn!(
                                "PRIVATE_MSG_RECEIVED video decrypt failed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            "[加密消息，等待密钥同步]".to_string()
                        }
                    }
                } else if om.msg_type == 7 {
                    match imweb::FileObj::decode(fallback_cipher) {
                        Ok(obj) => {
                            warn!(
                                "PRIVATE_MSG_RECEIVED decrypt failed but raw FileObj parsed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            file_obj_to_json(obj)
                        }
                        Err(_) => {
                            decrypt_pending = true;
                            warn!(
                                "PRIVATE_MSG_RECEIVED file decrypt failed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            "[加密消息，等待密钥同步]".to_string()
                        }
                    }
                } else if om.msg_type == 5 {
                    match imweb::NameCardObj::decode(fallback_cipher) {
                        Ok(obj) => {
                            warn!(
                                "PRIVATE_MSG_RECEIVED decrypt failed but raw NameCardObj parsed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            name_card_obj_to_legacy_content(obj)
                        }
                        Err(_) => {
                            decrypt_pending = true;
                            warn!(
                                "PRIVATE_MSG_RECEIVED name card decrypt failed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            "[加密消息，等待密钥同步]".to_string()
                        }
                    }
                } else if om.msg_type == 12 {
                    match imweb::SetImageObj::decode(fallback_cipher) {
                        Ok(obj) => {
                            warn!(
                                "PRIVATE_MSG_RECEIVED decrypt failed but raw SetImageObj parsed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            set_image_obj_to_legacy_content(obj)
                        }
                        Err(_) => {
                            decrypt_pending = true;
                            warn!(
                                "PRIVATE_MSG_RECEIVED set image decrypt failed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            "[加密消息，等待密钥同步]".to_string()
                        }
                    }
                } else if om.msg_type == 18 {
                    match imweb::AnimatedGameObj::decode(fallback_cipher) {
                        Ok(obj) => {
                            warn!(
                                "PRIVATE_MSG_RECEIVED decrypt failed but raw AnimatedGameObj parsed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            animated_game_obj_to_legacy_content(obj)
                        }
                        Err(_) => {
                            decrypt_pending = true;
                            warn!(
                                "PRIVATE_MSG_RECEIVED animated game decrypt failed sender_uid={} msg_id={} err={}",
                                om.send_uid, om.msg_id, e
                            );
                            "[加密消息，等待密钥同步]".to_string()
                        }
                    }
                } else if let Ok(obj) = imweb::TextObj::decode(fallback_cipher) {
                    warn!(
                        "PRIVATE_MSG_RECEIVED decrypt failed but raw TextObj parsed sender_uid={} msg_id={} err={}",
                        om.send_uid, om.msg_id, e
                    );
                    obj.content
                } else {
                    decrypt_pending = true;
                    warn!(
                        "PRIVATE_MSG_RECEIVED decrypt failed sender_uid={} msg_id={} err={}",
                        om.send_uid, om.msg_id, e
                    );
                    "[加密消息，等待密钥同步]".to_string()
                }
            }
        };
        info!(
            "PRIVATE_MSG_RECEIVED sender_uid={} receive_uid={} msg_id={} conversation_id={}",
            om.send_uid, om.receive_uid, om.msg_id, conversation_id
        );
        Ok(vec![DecodedMessage {
            cmd: cmds::PRIVATE_MSG_RECEIVED,
            msg_id: om.msg_id.to_string(),
            conversation_id,
            sender_id: om.send_uid.to_string(),
            msg_type: om.msg_type,
            content,
            send_time: om.send_time,
            status: 1,
            read_status: 0,
            extra: serde_json::json!({
                "receiveUid": om.receive_uid,
                "sendUid": om.send_uid,
                "isSelfSync": is_self,
                "version": om.version,
                "source": sender_source,
                "snapchatTime": om.snapchat_time,
                "deleteSeconds": if om.snapchat_time > 0 { i64::from(om.snapchat_time) * 1000 } else { 0 },
                "decryptPending": decrypt_pending,
                "friendIdCandidates": candidate_ids,
                "cipherHex": primary_cipher_hex,
                "cipherCandidates": cipher_candidates,
                "contentMd5": om.content_md5,
                // 与正文解密成功的候选 attachmentKey 对齐；iOS/PC 顶层 attachment_key 可能与 webContent 不一致。
                "attachmentKey": if selected_attachment_key.is_empty() {
                    om.attachment_key.clone()
                } else {
                    selected_attachment_key.clone()
                },
                "fileKey": selected_file_key.unwrap_or_default(),
                "messageContentAttachmentKey": selected_attachment_key,
                "sendUser": om
                    .send_user
                    .as_ref()
                    .map(user_base_to_json)
                    .unwrap_or(serde_json::Value::Null),
            }),
        }])
    }

    fn decode_channel_msg_received(&self, payload: &[u8]) -> Result<Vec<DecodedMessage>, String> {
        let resp = imweb::PushChannelMessage::decode(payload)
            .map_err(|e| format!("decode PushChannelMessage: {}", e))?;
        let Some(cm) = resp.latest_channel_message else {
            info!("[channel] CHANNEL_MSG_RECEIVED empty latest_channel_message");
            return Ok(Vec::new());
        };

        let crypto = self.app_handle.state::<crate::crypto::CryptoEngine>();
        let channel_id = cm.channel_id;
        let channel_id_s = channel_id.to_string();
        let conversation_id = format!("2_{}", channel_id);
        let key_cached = crypto.get_channel_key(&channel_id_s).is_some();
        info!(
            "[channel] CHANNEL_MSG_RECEIVED packet channel_id={} msg_id={} sender_uid={} msg_type={} cipher_len={} version={} key_cached={}",
            channel_id,
            cm.msg_id,
            cm.send_uid,
            cm.msg_type,
            cm.content.len(),
            cm.version,
            key_cached,
        );

        let (content, decrypt_pending) = match crypto
            .decrypt_channel_message(&channel_id_s, &cm.content)
        {
            Ok(plain) => {
                info!(
                    "[channel] CHANNEL_MSG_RECEIVED decrypt OK channel_id={} msg_id={} plain_len={}",
                    channel_id,
                    cm.msg_id,
                    plain.len()
                );
                (decode_content_obj(cm.msg_type, plain.as_slice()), false)
            }
            Err(e) => {
                if validate_plain_content(cm.msg_type, cm.content.as_slice(), &cm.content_md5) {
                    warn!(
                        "[channel] CHANNEL_MSG_RECEIVED decrypt failed but raw plaintext validated channel_id={} msg_id={} msg_type={} err={}",
                        channel_id, cm.msg_id, cm.msg_type, e
                    );
                    (
                        decode_content_obj(cm.msg_type, cm.content.as_slice()),
                        false,
                    )
                } else if cm.msg_type == 7 && imweb::FileObj::decode(cm.content.as_slice()).is_ok() {
                    warn!(
                        "[channel] decrypt failed but raw FileObj parsed channel_id={} msg_id={} err={}",
                        channel_id, cm.msg_id, e
                    );
                    (
                        decode_content_obj(cm.msg_type, cm.content.as_slice()),
                        false,
                    )
                } else if let Ok(obj) = imweb::TextObj::decode(cm.content.as_slice()) {
                    warn!(
                        "[channel] decrypt failed but raw TextObj parsed channel_id={} msg_id={} err={}",
                        channel_id, cm.msg_id, e
                    );
                    (obj.content, false)
                } else if cm.msg_type == 1 && imweb::ImageObj::decode(cm.content.as_slice()).is_ok()
                {
                    warn!(
                        "[channel] decrypt failed but raw ImageObj parsed channel_id={} msg_id={} err={}",
                        channel_id, cm.msg_id, e
                    );
                    (
                        decode_content_obj(cm.msg_type, cm.content.as_slice()),
                        false,
                    )
                } else if cm.msg_type == 9
                    && imweb::DynamicImageObj::decode(cm.content.as_slice()).is_ok()
                {
                    warn!(
                        "[channel] decrypt failed but raw DynamicImageObj parsed channel_id={} msg_id={} err={}",
                        channel_id, cm.msg_id, e
                    );
                    (
                        decode_content_obj(cm.msg_type, cm.content.as_slice()),
                        false,
                    )
                } else if cm.msg_type == 2 && imweb::AudioObj::decode(cm.content.as_slice()).is_ok()
                {
                    warn!(
                        "[channel] decrypt failed but raw AudioObj parsed channel_id={} msg_id={} err={}",
                        channel_id, cm.msg_id, e
                    );
                    (
                        decode_content_obj(cm.msg_type, cm.content.as_slice()),
                        false,
                    )
                } else if cm.msg_type == 3 && imweb::VideoObj::decode(cm.content.as_slice()).is_ok()
                {
                    warn!(
                        "[channel] decrypt failed but raw VideoObj parsed channel_id={} msg_id={} err={}",
                        channel_id, cm.msg_id, e
                    );
                    (
                        decode_content_obj(cm.msg_type, cm.content.as_slice()),
                        false,
                    )
                } else if cm.msg_type == 5
                    && imweb::NameCardObj::decode(cm.content.as_slice()).is_ok()
                {
                    warn!(
                        "[channel] decrypt failed but raw NameCardObj parsed channel_id={} msg_id={} err={}",
                        channel_id, cm.msg_id, e
                    );
                    (
                        decode_content_obj(cm.msg_type, cm.content.as_slice()),
                        false,
                    )
                } else if cm.msg_type == 12
                    && imweb::SetImageObj::decode(cm.content.as_slice()).is_ok()
                {
                    warn!(
                        "[channel] decrypt failed but raw SetImageObj parsed channel_id={} msg_id={} err={}",
                        channel_id, cm.msg_id, e
                    );
                    (
                        decode_content_obj(cm.msg_type, cm.content.as_slice()),
                        false,
                    )
                } else if cm.msg_type == 18
                    && imweb::AnimatedGameObj::decode(cm.content.as_slice()).is_ok()
                {
                    warn!(
                        "[channel] decrypt failed but raw AnimatedGameObj parsed channel_id={} msg_id={} err={}",
                        channel_id, cm.msg_id, e
                    );
                    (
                        decode_content_obj(cm.msg_type, cm.content.as_slice()),
                        false,
                    )
                } else if cm.msg_type == 17
                    && im::MediaTextListObj::decode(cm.content.as_slice()).is_ok()
                {
                    warn!(
                        "[channel] decrypt failed but raw MediaTextListObj parsed channel_id={} msg_id={} err={}",
                        channel_id, cm.msg_id, e
                    );
                    (
                        decode_content_obj(cm.msg_type, cm.content.as_slice()),
                        false,
                    )
                } else if let Ok(s) = String::from_utf8(cm.content.clone()) {
                    warn!(
                        "[channel] decrypt failed but raw UTF-8 parsed channel_id={} msg_id={} err={}",
                        channel_id, cm.msg_id, e
                    );
                    (s, false)
                } else {
                    warn!(
                        "[channel] CHANNEL_MSG_RECEIVED decrypt failed channel_id={} msg_id={} msg_type={} cipher_len={} version={} key_cached={} err={}",
                        channel_id,
                        cm.msg_id,
                        cm.msg_type,
                        cm.content.len(),
                        cm.version,
                        key_cached,
                        e
                    );
                    ("[加密消息，等待密钥同步]".to_string(), true)
                }
            }
        };

        let file_key = decrypt_channel_attachment_key(&crypto, &channel_id_s, &cm.attachment_key)
            .or_else(|| fallback_plain_file_key(&cm.attachment_key));
        Ok(vec![DecodedMessage {
            cmd: cmds::CHANNEL_MSG_RECEIVED,
            msg_id: cm.msg_id.to_string(),
            conversation_id,
            sender_id: cm.send_uid.to_string(),
            msg_type: cm.msg_type,
            content,
            send_time: cm.msg_time,
            status: 1,
            read_status: 0,
            extra: serde_json::json!({
                "channelId": channel_id,
                "version": cm.version,
                "contentMd5": cm.content_md5,
                "readTotal": cm.read_total,
                "decryptPending": decrypt_pending,
                "cipherHex": hex::encode(&cm.content),
                "attachmentKey": cm.attachment_key,
                "fileKey": file_key,
            }),
        }])
    }

    fn decode_channel_event_push(&self, payload: &[u8]) -> Result<Vec<DecodedMessage>, String> {
        let resp = imweb::PushChannelEventMessage::decode(payload)
            .map_err(|e| format!("decode PushChannelEventMessage: {}", e))?;
        let Some(event) = resp.latest_channel_event_message else {
            info!("[channel] CHANNEL_EVENT_PUSH empty latest_channel_event_message");
            return Ok(Vec::new());
        };

        let channel_info = event.channel_info.as_ref();
        let subscriber_info = event.subscriber_info.as_ref();
        let timestamp = normalize_timestamp(event.msg_time);
        let base_msg_id = if event.msg_id > 0 {
            event.msg_id.to_string()
        } else {
            format!("channel-event-{}-{}", event.channel_id, timestamp)
        };
        let mut out = Vec::new();

        if event.channel_id > 0 {
            if let Some(info) = channel_info {
                if info.operate_type == im::ChannelOperateType::ChannelContent as i32 {
                    let _ = self.app_handle.emit(
                        "channel:content-limit",
                        serde_json::json!({
                            "channelId": event.channel_id.to_string(),
                            "contentLimit": info.content_limit,
                            "isLimit": if info.content_limit { 1 } else { 0 },
                        }),
                    );
                }
            }

            if let Some(reason) = channel_removed_reason(
                event.event_type,
                subscriber_info.map(|item| item.operate_type),
                channel_info.map(|item| item.operate_type),
            ) {
                // 频道退出/解散/注销要立刻同步给前端删除本地会话；可见通知仍只依赖服务端 channel_notice_msg。
                let _ = self.app_handle.emit(
                    "channel:removed",
                    serde_json::json!({
                        "channelId": event.channel_id.to_string(),
                        "channelName": channel_info
                            .map(|item| item.channel_name.clone())
                            .unwrap_or_default(),
                        "icon": channel_info.map(|item| item.icon.clone()).unwrap_or_default(),
                        "reason": reason,
                    }),
                );
            }
        }

        if let Some(notice) = event.channel_notice_msg.as_ref() {
            if notice.is_notice {
                let content = notice.notice_msg.trim();
                let content = if content.is_empty() {
                    event.msg.trim()
                } else {
                    content
                };
                if !content.is_empty() {
                    let is_subscriber_remove = is_subscriber_remove_event(
                        event.event_type,
                        subscriber_info.map(|item| item.operate_type),
                        content,
                    );
                    let notice_source = if is_subscriber_remove {
                        "channel-remove"
                    } else {
                        "channel-notice"
                    };
                    info!(
                        "[channel] emit CHANNEL_EVENT_PUSH as channel notice msg_id={} channel_id={} content={}",
                        base_msg_id, event.channel_id, content
                    );
                    out.push(DecodedMessage {
                        cmd: cmds::CHANNEL_EVENT_PUSH,
                        msg_id: base_msg_id.clone(),
                        conversation_id: "0_channelNotice".to_string(),
                        sender_id: event.channel_id.to_string(),
                        msg_type: 8,
                        content: content.to_string(),
                        send_time: timestamp,
                        status: 1,
                        read_status: 0,
                        extra: serde_json::json!({
                            "source": notice_source,
                            "channelId": event.channel_id.to_string(),
                            "channelName": channel_info
                                .map(|item| item.channel_name.clone())
                                .unwrap_or_default(),
                            "icon": channel_info.map(|item| item.icon.clone()).unwrap_or_default(),
                            "eventType": event.event_type,
                            "channelOperateType": channel_info.map(|item| item.operate_type).unwrap_or_default(),
                            "subscriberOperateType": subscriber_info.map(|item| item.operate_type).unwrap_or_default(),
                            "reqStatus": subscriber_info.map(|item| item.req_status).unwrap_or_default(),
                            "unReadNum": notice.un_read_num,
                        }),
                    });
                }
            }
        }

        let is_subscriber_join = event.event_type == 2
            && subscriber_info
                .map(|item| item.operate_type == 0)
                .unwrap_or(false);
        if is_subscriber_join && event.channel_id > 0 {
            let content = event.msg.trim();
            let content = if content.is_empty() {
                "您已加入频道"
            } else {
                content
            };
            out.push(DecodedMessage {
                cmd: cmds::CHANNEL_EVENT_PUSH,
                msg_id: format!("{}-channel-join", base_msg_id),
                conversation_id: format!("2_{}", event.channel_id),
                sender_id: event.channel_id.to_string(),
                msg_type: 8,
                content: content.to_string(),
                send_time: timestamp,
                status: 1,
                read_status: 0,
                extra: serde_json::json!({
                    "source": "channel-event",
                    "channelId": event.channel_id.to_string(),
                    "channelName": channel_info
                        .map(|item| item.channel_name.clone())
                        .unwrap_or_default(),
                    "icon": channel_info.map(|item| item.icon.clone()).unwrap_or_default(),
                    "eventType": event.event_type,
                    "subscriberOperateType": subscriber_info.map(|item| item.operate_type).unwrap_or_default(),
                    "memberType": subscriber_info.map(|item| item.role).unwrap_or(9),
                }),
            });
        }
        if should_emit_subscriber_remove_fallback(
            event.event_type,
            subscriber_info.map(|item| item.operate_type),
            event.channel_id,
            !out.is_empty(),
        ) {
            let content = event.msg.trim();
            let content = if content.is_empty() {
                "您已被移出频道"
            } else {
                content
            };
            out.push(DecodedMessage {
                cmd: cmds::CHANNEL_EVENT_PUSH,
                msg_id: format!("{}-channel-remove", base_msg_id),
                conversation_id: "0_channelNotice".to_string(),
                sender_id: event.channel_id.to_string(),
                msg_type: 8,
                content: content.to_string(),
                send_time: timestamp,
                status: 1,
                read_status: 0,
                extra: serde_json::json!({
                    "source": "channel-remove",
                    "channelId": event.channel_id.to_string(),
                    "channelName": channel_info
                        .map(|item| item.channel_name.clone())
                        .unwrap_or_default(),
                    "icon": channel_info.map(|item| item.icon.clone()).unwrap_or_default(),
                    "eventType": event.event_type,
                    "subscriberOperateType": subscriber_info.map(|item| item.operate_type).unwrap_or_default(),
                }),
            });
        }

        Ok(out)
    }

    fn handle_key_pair_change(&self, payload: &[u8]) -> Result<(), String> {
        let resp = imweb::PushKeyPairChangeMessageResp::decode(payload)
            .map_err(|e| format!("decode PushKeyPairChangeMessageResp: {}", e))?;
        let uid = resp.uid.to_string();
        let crypto = self.app_handle.state::<crate::crypto::CryptoEngine>();
        // 对齐旧版 im：20501 不只用于当前会话内存派生，也要继续通知前端更新好友公钥缓存，
        // 这样重启后仍能按版本恢复单聊发消息所需的 friend key 映射。
        let _ = self.app_handle.emit(
            "key-pair:change",
            serde_json::json!({
                "uid": uid.clone(),
                "appKeyPair": resp.app_key_pair.as_ref().map(|item| serde_json::json!({
                    "publicKey": item.public_key,
                    "keyVersion": item.key_version,
                })),
                "webKeyPair": resp.web_key_pair.as_ref().map(|item| serde_json::json!({
                    "publicKey": item.public_key,
                    "keyVersion": item.key_version,
                })),
            }),
        );

        if let Some(web) = resp.web_key_pair.as_ref() {
            if !web.public_key.is_empty() && web.key_version > 0 {
                // Do not cache pushed web keys here. Unlike the old im, im-new also uses
                // the Rust friend-key cache to choose the sender's own top-level web
                // version. A 20501 from another PC under the same account can otherwise
                // poison outgoing messages with a version whose private key we do not own.
                info!(
                    "KEY_PAIR_CHANGE observed web key uid={} version={} (not cached)",
                    uid, web.key_version
                );
            }
        }
        if let Some(app) = resp.app_key_pair.as_ref() {
            if !app.public_key.is_empty() && app.key_version > 0 {
                match crypto.derive_friend_key(
                    &uid,
                    app.key_version as i64,
                    "app",
                    &app.public_key,
                    &[],
                ) {
                    Ok(_) => info!(
                        "KEY_PAIR_CHANGE cached app key uid={} version={}",
                        uid, app.key_version
                    ),
                    Err(e) => warn!(
                        "KEY_PAIR_CHANGE derive app key failed uid={} version={} err={}",
                        uid, app.key_version, e
                    ),
                }
            }
        }
        Ok(())
    }

    pub async fn flush(&mut self) {
        if self.buffer.is_empty() {
            return;
        }

        let messages: Vec<DecodedMessage> = self.buffer.drain(..).collect();
        self.last_flush = Instant::now();

        let by_conversation = group_by_conversation(&messages);

        for (conv_id, msgs) in &by_conversation {
            let _ = self
                .app_handle
                .emit(&format!("msg:batch:{}", conv_id), msgs);
        }

        let _ = self.app_handle.emit("msg:batch", &messages);

        info!(
            "Flushed {} messages in {} conversations",
            messages.len(),
            by_conversation.len()
        );
    }

    fn emit_group_msg_sent(&self, payload: &[u8]) -> Result<(), String> {
        let resp = imweb::SendGroupMessageResp::decode(payload)
            .map_err(|e| format!("decode SendGroupMessageResp: {}", e))?;
        let evt = MsgSentEvent {
            flag: resp.flag,
            msg_id: resp.msg_id,
            group_id: resp.group_id,
            sent_over_time: resp.sent_over_time,
            conversation_id: format!("1_{}", resp.group_id),
        };
        info!(
            "GROUP_MSG_SENT flag={} msg_id={} group_id={}",
            evt.flag, evt.msg_id, evt.group_id
        );
        self.app_handle
            .emit("msg:sent", &evt)
            .map_err(|e| format!("emit msg:sent: {}", e))?;
        Ok(())
    }

    fn emit_private_msg_sent(&self, payload: &[u8]) -> Result<(), String> {
        let resp = imweb::OneToOneMessageResp::decode(payload)
            .map_err(|e| format!("decode OneToOneMessageResp: {}", e))?;
        let evt = MsgSentEvent {
            flag: resp.flag,
            msg_id: resp.msg_id,
            group_id: 0,
            sent_over_time: resp.sent_over_time,
            conversation_id: format!("0_{}", resp.receive_uid),
        };
        info!(
            "PRIVATE_MSG_SENT flag={} msg_id={} receive_uid={}",
            evt.flag, evt.msg_id, resp.receive_uid
        );
        self.app_handle
            .emit("msg:sent", &evt)
            .map_err(|e| format!("emit msg:sent: {}", e))?;
        Ok(())
    }

    fn emit_channel_msg_sent(&self, payload: &[u8]) -> Result<(), String> {
        let resp = imweb::PushSendChannelMessageSuccessMessage::decode(payload)
            .map_err(|e| format!("decode PushSendChannelMessageSuccessMessage: {}", e))?;
        let evt = MsgSentEvent {
            flag: resp.flag,
            msg_id: resp.msg_id,
            group_id: 0,
            sent_over_time: 0,
            conversation_id: format!("2_{}", resp.channel_id),
        };
        info!(
            "[channel] CHANNEL_MSG_SENT receipt flag={} msg_id={} channel_id={}",
            evt.flag, evt.msg_id, resp.channel_id
        );
        self.app_handle
            .emit("msg:sent", &evt)
            .map_err(|e| format!("emit msg:sent: {}", e))?;
        Ok(())
    }

    fn emit_recall_message(&self, conversation_type: &str, recall: imweb::RecallMessage) {
        let conv_prefix = match conversation_type {
            "group" => 1,
            "channel" => 2,
            _ => 0,
        };
        let conversation_id = if recall.msg_target_id > 0 {
            format!("{}_{}", conv_prefix, recall.msg_target_id)
        } else {
            String::new()
        };
        let payload = serde_json::json!({
            "messageId": recall.msg_id.to_string(),
            "conversationId": conversation_id,
            "targetId": recall.msg_target_id.to_string(),
            "type": conversation_type,
            "clear": recall.clear,
            "clearTime": recall.clear_time,
        });
        let _ = self.app_handle.emit("msg:recall", &payload);
        info!(
            "emit msg:recall type={} msg_id={} target_id={} clear={}",
            conversation_type, recall.msg_id, recall.msg_target_id, recall.clear
        );
    }

    fn emit_error_resp(&self, payload: &[u8]) -> Result<(), String> {
        let resp = imweb::ErrrMessageResp::decode(payload)
            .map_err(|e| format!("decode ErrrMessageResp: {}", e))?;
        let (err_code, err_msg) = if let Some(cr) = resp.common_result.as_ref() {
            (cr.err_code, cr.err_msg.clone())
        } else {
            (0, String::new())
        };
        let conversation_id = match resp.message_protocol_id {
            10201 => format!("1_{}", resp.target_id), // 群聊发送错误
            10101 => format!("0_{}", resp.target_id), // 私聊发送错误
            4101 => format!("2_{}", resp.target_id),  // 频道发送错误
            _ => String::new(),
        };
        let evt = MsgSendFailedEvent {
            flag: resp.flag,
            target_id: resp.target_id,
            message_protocol_id: resp.message_protocol_id,
            err_code,
            err_msg: err_msg.clone(),
            conversation_id: conversation_id.clone(),
        };
        warn!(
            "ERROR_RESP(29999) err_code={} err_msg={} protocol={} flag={} target_id={} conversation_id={}",
            err_code,
            err_msg,
            resp.message_protocol_id,
            resp.flag,
            resp.target_id,
            conversation_id
        );
        if err_code == 100 {
            let reason = if err_msg.trim().is_empty() {
                "登录已过期，请重新登录".to_string()
            } else {
                err_msg.clone()
            };
            warn!(
                "ERROR_RESP auth expired, force logout protocol={} reason={}",
                resp.message_protocol_id, reason
            );
            let _ = self.app_handle.emit(
                "auth:force-logout",
                ForceLogoutEvent {
                    cmd: cmds::ERROR_RESP,
                    reason,
                    kick_type: 1,
                },
            );
            let _ = self.app_handle.emit("ws:status", "disconnected");
            return Ok(());
        }
        self.app_handle
            .emit("msg:send-failed", &evt)
            .map_err(|e| format!("emit msg:send-failed: {}", e))?;
        Ok(())
    }

    fn emit_receipt_push(&self, payload: &[u8]) -> Result<(), String> {
        let resp = imweb::PushReceiptMessageResp::decode(payload)
            .map_err(|e| format!("decode PushReceiptMessageResp: {}", e))?;
        let events = resp
            .receipts
            .into_iter()
            .map(|item| MsgReadReceiptEvent {
                msg_id: item.msg_id,
                send_uid: item.send_uid,
                target_id: item.target_id,
                status: item
                    .receipt_status
                    .as_ref()
                    .map(|status| status.status)
                    .unwrap_or_default(),
                read_time: item
                    .receipt_status
                    .as_ref()
                    .map(|status| status.time)
                    .unwrap_or_default(),
                snapchat_time: item.snapchat_time,
            })
            .collect::<Vec<_>>();

        if !events.is_empty() {
            self.app_handle
                .emit("msg:read-receipt", &events)
                .map_err(|e| format!("emit msg:read-receipt: {}", e))?;
        }
        Ok(())
    }

    fn emit_group_read_receipt_push(&self, payload: &[u8]) -> Result<(), String> {
        let resp = imweb::PushGroupMsgReceiptMessage::decode(payload)
            .map_err(|e| format!("decode PushGroupMsgReceiptMessage: {}", e))?;
        let events = resp
            .receipt_message
            .into_iter()
            .map(|item| GroupMsgReadReceiptEvent {
                msg_id: item.msg_id,
                group_id: item.group_id,
                send_uid: item.send_uid,
                status: item
                    .receipt_status
                    .as_ref()
                    .map(|status| status.status)
                    .unwrap_or_default(),
                read_time: item
                    .receipt_status
                    .as_ref()
                    .map(|status| status.time)
                    .unwrap_or_default(),
            })
            .collect::<Vec<_>>();

        if !events.is_empty() {
            self.app_handle
                .emit("msg:group-read-receipt", &events)
                .map_err(|e| format!("emit msg:group-read-receipt: {}", e))?;
        }
        Ok(())
    }

    fn emit_channel_read_push(&self, payload: &[u8]) -> Result<(), String> {
        let resp = imweb::PushReadChannelMessage::decode(payload)
            .map_err(|e| format!("decode PushReadChannelMessage: {}", e))?;
        let evt = ChannelReadReceiptPushEvent {
            channel_id: resp.channel_id,
            read_channel_messages: resp
                .read_channel_messages
                .into_iter()
                .map(|item| ChannelReadReceiptEvent {
                    msg_id: item.msg_id,
                    total: item.total,
                })
                .collect(),
        };

        if evt.channel_id > 0 && !evt.read_channel_messages.is_empty() {
            self.app_handle
                .emit("msg:channel-read-receipt", &evt)
                .map_err(|e| format!("emit msg:channel-read-receipt: {}", e))?;
        }
        Ok(())
    }

    fn emit_group_live_send_gift(&self, payload: &[u8]) -> Result<(), String> {
        let evt = decode_group_live_send_gift_event(payload)?;
        // 对齐旧 im 的事件模型：2217 是 UI 即时提示，不进入消息批处理和本地数据库。
        self.app_handle
            .emit("group-live:send-gift", &evt)
            .map_err(|e| format!("emit group-live:send-gift: {}", e))?;
        Ok(())
    }
}

fn decode_group_live_send_gift_event(payload: &[u8]) -> Result<GroupLiveSendGiftEvent, String> {
    let resp = imweb::PushGroupLiveSendGiftMsg::decode(payload)
        .map_err(|e| format!("decode PushGroupLiveSendGiftMsg: {}", e))?;

    // Rust 字段保持 proto 语义，serde 统一输出 camelCase，避免前端再做蛇形字段兼容。
    Ok(GroupLiveSendGiftEvent {
        group_id: resp.group_id,
        live_room_id: resp.live_room_id,
        gift_id: resp.gift_id,
        gift_type: resp.gift_type,
        animation_url: resp.animation_url,
        sound_url: resp.sound_url,
        gift_name: resp.gift_name,
        quantity: resp.quantity,
        icon_url: resp.icon_url,
        from_uid: resp.from_uid,
        anchor_uid: resp.anchor_uid,
        coin_name: resp.coin_name,
        amount: resp.amount,
        room_sum_amount: resp.room_sum_amount,
    })
}

fn normalize_timestamp(ts: i64) -> i64 {
    if ts > 0 {
        ts
    } else {
        chrono::Utc::now().timestamp_millis()
    }
}

fn friend_display_name(user: &imweb::UserBase) -> String {
    if let Some(relation) = user.friend_relation.as_ref() {
        let remark = relation.remark_name.trim();
        if !remark.is_empty() {
            return remark.to_string();
        }
    }
    let nick = user.nick_name.trim();
    if !nick.is_empty() {
        nick.to_string()
    } else if user.uid > 0 {
        user.uid.to_string()
    } else {
        "对方".to_string()
    }
}

fn friend_read_cancel_tip(seconds: i32, name: String, enabled: bool) -> String {
    if !enabled {
        return format!("{}关闭了阅后即焚", name);
    }

    let seconds = seconds.max(0);
    let time_text = if seconds < 60 {
        format!("{}秒", seconds)
    } else if seconds < 60 * 60 {
        format!("{}分钟", seconds / 60)
    } else if seconds < 60 * 60 * 24 {
        format!("{}小时", seconds / (60 * 60))
    } else {
        format!("{}天", seconds / (60 * 60 * 24))
    };
    format!("{} 设置了消息已读{}后销毁", name, time_text)
}

fn group_event_content(item: &imweb::GroupReqEventMsgDto, common: &imweb::CommonMsgDto) -> String {
    let raw = common.msg.trim();
    // 服务端部分群事件只下发“群聊事件”占位；前端会隐藏该占位，所以要继续按旧 im 生成可见提示文案。
    if !raw.is_empty() && raw != "群聊事件" {
        return raw.to_string();
    }

    if let Some(notice) = item.group_notice_msg_dto.as_ref() {
        let notice_msg = notice.notice_msg.trim();
        if !notice_msg.is_empty() && notice_msg != "群聊事件" {
            return notice_msg.to_string();
        }
    }

    let actor = if item.from_uid > 0 {
        item.from_uid.to_string()
    } else {
        String::new()
    };

    let names = item
        .group_member
        .iter()
        .filter_map(|member| member.user.as_ref())
        .map(|user| {
            let nick = user.nick_name.trim();
            if nick.is_empty() {
                user.uid.to_string()
            } else {
                nick.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("，");

    let invited = if names.is_empty() {
        "你".to_string()
    } else {
        names
    };

    match (item.group_req_type, item.group_req_status) {
        (1 | 3, 0 | 1) => {
            if actor.is_empty() {
                format!("邀请{}加入群聊", invited)
            } else {
                format!("{} 邀请{}加入群聊", actor, invited)
            }
        }
        (2 | 4, 0 | 1) => format!("{}通过扫描二维码加入了群聊", invited),
        (14, 0 | 1) => format!("{}通过群链接加入了群聊", invited),
        (15, 0 | 1) => format!("{}通过群别名加入了群聊", invited),
        (6, _) => format!("{}被移出群聊", invited),
        (7, _) => format!("{}退出群聊", invited),
        (13, _) => "该群聊已解散".to_string(),
        (_, 2) => format!("{}拒绝加入群聊", invited),
        _ => "群聊事件".to_string(),
    }
}

fn group_req_event_goes_to_invitation_only(item: &imweb::GroupReqEventMsgDto) -> bool {
    // 与旧 im 的群事件分支对齐：邀请/扫码/别名入群在待审核阶段只进入
    // “群通知”伪会话；管理员拒绝申请也只进入群通知，避免未入群用户看到正式群会话。
    matches!(item.group_req_type, 1 | 2 | 15) && item.group_req_status != 1
        || matches!(item.group_req_type, 3 | 4) && item.group_req_status == 2
}

fn group_admin_change_invitation_message(
    item: &imweb::GroupReqEventMsgDto,
    common: &imweb::CommonMsgDto,
    group: &imweb::GroupBaseInfo,
    current_uid: &str,
) -> Option<DecodedMessage> {
    if !matches!(item.group_req_type, 8 | 9) {
        return None;
    }

    let current_uid = current_uid.trim().parse::<i64>().unwrap_or(0);
    if current_uid <= 0 {
        return None;
    }

    let target_uid = first_group_req_event_member_uid(item);
    if target_uid != current_uid {
        return None;
    }

    let notice_msg_id = group_req_event_notice_message_id(item, common, group.group_id);
    let content = match item.group_req_type {
        8 if item.from_uid > 0 => format!("#{{uids:{}}}将你设置为管理员", item.from_uid),
        8 => "你已成为本群管理员".to_string(),
        9 => "你的管理员身份已被移除".to_string(),
        _ => return None,
    };

    // 对齐旧 im：自己的管理员身份变化时，除群内系统消息外，还要刷新“群通知”伪会话摘要和未读。
    Some(DecodedMessage {
        cmd: cmds::GROUP_EVENT_PUSH,
        msg_id: format!("{}-invitation", notice_msg_id),
        conversation_id: "1_invitation".to_string(),
        sender_id: item.from_uid.to_string(),
        msg_type: 8,
        content,
        send_time: normalize_timestamp(common.update_time),
        status: 1,
        read_status: 0,
        extra: serde_json::json!({
            "source": "group-event-admin-notification",
            "groupId": group.group_id.to_string(),
            "groupName": group.group_name,
            "groupAvatar": group.pic,
            "groupMuted": group.group_shutup,
            "groupReadCancel": group.group_read_cancel,
            "groupMsgCancelTime": group.group_msg_cancel_time,
            "memberCount": item.group_member.len(),
            "members": item.group_member.iter().map(group_member_to_json).collect::<Vec<_>>(),
            "groupReqType": item.group_req_type,
            "groupReqStatus": item.group_req_status,
            "eventType": common.even_type,
            "groupEventMsgId": common.msg_id.to_string(),
            "groupMsgType": common.msg_type,
            "receiveUid": item.receive_uid.to_string(),
            "fromUid": item.from_uid.to_string(),
            "sendUid": item.from_uid.to_string(),
            "checkUid": item.check_uid.to_string(),
            "incrementUnread": true,
            "notificationIdentity": notice_msg_id,
        }),
    })
}

fn first_group_req_event_member_uid(item: &imweb::GroupReqEventMsgDto) -> i64 {
    item.group_member
        .iter()
        .find_map(|member| member.user.as_ref().map(|user| user.uid))
        .unwrap_or(0)
}

fn should_hide_group_remove_notice_for_current_user(
    item: &imweb::GroupReqEventMsgDto,
    current_uid: &str,
) -> bool {
    if item.group_req_type != 6 {
        return false;
    }

    let current_uid = current_uid.trim().parse::<i64>().unwrap_or(0);
    if current_uid <= 0 {
        return false;
    }

    let removed_uid = first_group_req_event_member_uid(item);
    if removed_uid <= 0 {
        return false;
    }

    // 被移除本人和踢人者需要收到提示；其它群主/管理员只接收隐藏占位用于刷新成员状态。
    current_uid != removed_uid && current_uid != item.from_uid
}

fn stable_group_req_notice_id(
    group_id: i64,
    req_type: i32,
    send_uid: i64,
    receive_uid: i64,
) -> String {
    format!(
        "group-req-notice-{}-{}-{}-{}",
        group_id.max(0),
        req_type,
        send_uid.max(0),
        receive_uid.max(0),
    )
}

fn group_req_event_notice_message_id(
    item: &imweb::GroupReqEventMsgDto,
    common: &imweb::CommonMsgDto,
    group_id: i64,
) -> String {
    if common.msg_id > 0 {
        return format!(
            "group-event-{}-{}-{}",
            group_id.max(0),
            common.msg_type,
            common.msg_id
        );
    }

    let receive_uid = if item.receive_uid > 0 {
        item.receive_uid
    } else {
        first_group_req_event_member_uid(item)
    };
    // 创群事件可能没有服务端 msgId；fallback 仍要带 msgType，避免“创群邀请汇总”和“同意入群”覆盖成一条。
    format!(
        "group-req-notice-{}-{}-{}-{}-{}",
        group_id.max(0),
        item.group_req_type,
        common.msg_type,
        item.from_uid.max(0),
        receive_uid.max(0),
    )
}

fn group_member_to_json(member: &imweb::GroupMemberBase) -> serde_json::Value {
    let user = member.user.as_ref();
    serde_json::json!({
        "groupId": member.group_id.to_string(),
        "userId": user.map(|u| u.uid.to_string()).unwrap_or_default(),
        "nickname": user.map(|u| u.nick_name.clone()).unwrap_or_default(),
        "avatar": user.map(|u| u.icon.clone()).unwrap_or_default(),
        "role": member.r#type,
    })
}

fn user_base_to_json(user: &imweb::UserBase) -> serde_json::Value {
    let remark = user
        .friend_relation
        .as_ref()
        .map(|relation| relation.remark_name.clone())
        .unwrap_or_default();
    serde_json::json!({
        "uid": user.uid.to_string(),
        "userId": user.uid.to_string(),
        "nickName": user.nick_name.clone(),
        "nickname": user.nick_name.clone(),
        "remarkName": remark,
        "icon": user.icon.clone(),
        "avatar": user.icon.clone(),
        "identify": user.identify.clone(),
    })
}

fn group_req_items_to_system_messages(
    cmd: u16,
    items: &[imweb::GroupReqMsgDto],
) -> Vec<DecodedMessage> {
    let mut out = Vec::new();
    for item in items {
        if item.group_id <= 0 {
            continue;
        }

        let content = group_req_notice_content(item);
        if content.trim().is_empty() {
            continue;
        }

        let msg_id = group_req_notice_message_id(item);
        let group_member = item.group_member.as_ref().map(group_member_to_json);
        let member_count = if group_member.is_some() { 1 } else { 0 };

        let group_member_json = group_member.into_iter().collect::<Vec<_>>();
        out.push(DecodedMessage {
            cmd,
            msg_id: msg_id.clone(),
            conversation_id: "1_invitation".to_string(),
            sender_id: item.send_uid.to_string(),
            msg_type: 8,
            content: content.clone(),
            send_time: normalize_timestamp(item.update_time),
            status: 1,
            read_status: 0,
            extra: serde_json::json!({
                "source": "group-event-req",
                "groupId": item.group_id.to_string(),
                "groupName": item.group_name,
                "groupAvatar": item.pic,
                "groupMuted": item.group_shutup,
                "memberCount": member_count,
                "members": group_member_json,
                "groupReqId": item.group_req_id,
                "groupReqType": item.group_req_type,
                "groupReqStatus": item.group_req_status,
                "sendUid": item.send_uid.to_string(),
                "receiveUid": item.receive_uid.to_string(),
                "checkUserType": item.check_user_type,
                "targetUser": item.target_user.as_ref().map(user_base_to_json),
                "checkUser": item.check_user.as_ref().map(user_base_to_json),
                "fromUser": item.from_user.as_ref().map(user_base_to_json),
                "handleType": item.handle_type,
                "unReadNum": item.un_read_num,
                "notificationIdentity": msg_id,
            }),
        });

        if should_emit_group_req_chat_notice(item) {
            let group_member = item.group_member.as_ref().map(group_member_to_json);
            let group_member_json = group_member.into_iter().collect::<Vec<_>>();
            out.push(DecodedMessage {
                cmd,
                msg_id: format!("group-req-chat-{}", msg_id),
                conversation_id: format!("1_{}", item.group_id),
                sender_id: item.send_uid.to_string(),
                msg_type: 8,
                content,
                send_time: normalize_timestamp(item.update_time),
                status: 1,
                read_status: 0,
                extra: serde_json::json!({
                    "source": "group-event-req-chat",
                    "groupId": item.group_id.to_string(),
                    "groupName": item.group_name,
                    "groupAvatar": item.pic,
                    "groupMuted": item.group_shutup,
                    "memberCount": member_count,
                    "members": group_member_json,
                    "groupReqId": item.group_req_id,
                    "groupReqType": item.group_req_type,
                    "groupReqStatus": item.group_req_status,
                    "sendUid": item.send_uid.to_string(),
                    "receiveUid": item.receive_uid.to_string(),
                    "checkUserType": item.check_user_type,
                    "targetUser": item.target_user.as_ref().map(user_base_to_json),
                    "checkUser": item.check_user.as_ref().map(user_base_to_json),
                    "fromUser": item.from_user.as_ref().map(user_base_to_json),
                    "handleType": item.handle_type,
                }),
            });
        }
    }
    out
}

fn group_req_notice_message_id(item: &imweb::GroupReqMsgDto) -> String {
    stable_group_req_notice_id(
        item.group_id,
        item.group_req_type,
        item.send_uid,
        item.receive_uid,
    )
}

fn should_emit_group_req_chat_notice(item: &imweb::GroupReqMsgDto) -> bool {
    item.group_id > 0
        && item.group_req_status == 1
        && matches!(item.group_req_type, 1 | 2 | 3 | 4 | 14 | 15)
}

fn group_req_notice_content(item: &imweb::GroupReqMsgDto) -> String {
    let raw = item.msg.trim();
    if !raw.is_empty() {
        return raw.to_string();
    }

    let target_name = item
        .target_user
        .as_ref()
        .map(display_user_base_name)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| {
            if item.receive_uid > 0 {
                item.receive_uid.to_string()
            } else {
                "你".to_string()
            }
        });

    match (item.group_req_type, item.group_req_status) {
        (1 | 3, 0 | 1) => {
            if item.send_uid > 0 {
                format!("{} 邀请{}加入群聊", item.send_uid, target_name)
            } else {
                format!("邀请{}加入群聊", target_name)
            }
        }
        (2 | 4, 0 | 1) => format!("{}通过扫描二维码加入了群聊", target_name),
        (14, 0 | 1) => format!("{}通过群链接加入了群聊", target_name),
        (15, 0 | 1) => format!("{}通过群别名加入了群聊", target_name),
        (13, _) => "该群聊已解散".to_string(),
        (_, 2) => format!("{}拒绝加入群聊", target_name),
        _ => String::new(),
    }
}

fn display_user_base_name(user: &imweb::UserBase) -> String {
    let nick = user.nick_name.trim();
    if !nick.is_empty() {
        return nick.to_string();
    }
    if user.uid > 0 {
        return user.uid.to_string();
    }
    String::new()
}

fn group_by_conversation(messages: &[DecodedMessage]) -> HashMap<String, Vec<DecodedMessage>> {
    let mut map: HashMap<String, Vec<DecodedMessage>> = HashMap::new();
    for msg in messages {
        map.entry(msg.conversation_id.clone())
            .or_default()
            .push(msg.clone());
    }
    map
}

fn decode_by_cmd(cmd: u16, _payload: &[u8]) -> Result<DecodedMessage, String> {
    Err(format!("unsupported cmd {}", cmd))
}
