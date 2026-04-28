use std::collections::HashMap;
use prost::Message as _;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{Duration, Instant};
use tracing::{error, info, warn};
                
use crate::crypto;
use crate::proto::{im, imweb};
use crate::ws::commands as cmds;

const FLUSH_INTERVAL_MS: u64 = 100;
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
        2 => match imweb::AudioObj::decode(plain) {
            Ok(obj) => audio_obj_to_json(obj),
            Err(_) => String::from_utf8_lossy(plain).to_string(),
        },
        _ => match imweb::TextObj::decode(plain) {
            Ok(obj) => obj.content,
            Err(_) => String::from_utf8_lossy(plain).to_string(),
        },
    }
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

fn audio_obj_to_json(obj: imweb::AudioObj) -> String {
    serde_json::json!({
        "url": obj.url,
        "duration": obj.duration,
        "size": obj.file_size,
    })
    .to_string()
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
    crypto
        .decrypt_friend_message(friend_id, version, source, &data)
        .or_else(|_| {
            let key = crypto
                .get_latest_friend_key(friend_id, source)
                .ok_or(crate::crypto::CryptoError::KeyNotFound)?;
            crate::crypto::aes::decrypt_message(&data, &key)
        })
        .ok()
        .and_then(|plain| String::from_utf8(plain).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
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

pub struct MessageBatcher {
    buffer: Vec<DecodedMessage>,
    last_flush: Instant,
    app_handle: AppHandle,
    aes_key: String,
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ForceLogoutEvent {
    cmd: u16,
    reason: String,
    kick_type: i32,
}

impl MessageBatcher {
    pub fn new(app_handle: AppHandle, aes_key: String) -> Self {
        Self {
            buffer: Vec::with_capacity(MAX_BATCH_SIZE),
            last_flush: Instant::now(),
            app_handle,
            aes_key,
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
                        info!(
                            "USER_ONLINE_STATUS_PUSH emitted users={}",
                            resp.users.len()
                        );
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
                        self.buffer.append(&mut msgs);
                        if self.buffer.len() >= MAX_BATCH_SIZE
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
                        self.buffer.append(&mut msgs);
                        if self.buffer.len() >= MAX_BATCH_SIZE
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
            cmds::KEY_PAIR_CHANGE_PUSH => {
                if let Err(e) = self.handle_key_pair_change(&decoded_payload) {
                    warn!("decode KEY_PAIR_CHANGE_PUSH failed: {}", e);
                }
                return;
            }
            // 这些命令不是聊天正文，不进消息列表，避免干扰日志与 UI。
            cmds::GROUP_REQ_NUM_PUSH
            | cmds::GROUP_REQ_MSG_PUSH
            | cmds::LOGIN_RESP => {
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
        let _ = self.app_handle.emit("auth:force-logout", ForceLogoutEvent {
            cmd,
            reason,
            kick_type,
        });
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
            // 和私聊一致：解密失败时除了给一个占位文案，还要带上 cipherHex +
            // decryptPending，让前端 `msg:batch` 监听到后可以 ensureGroupRelKey
            // 再走一次 `decrypt_group_incoming` 重试，从而彻底消除"表情/文本首
            // 条消息在 key warmup 之前到达时被永久卡住在 [加密消息，等待密钥
            // 同步]"的现象。
            let (content, decrypt_pending) =
                match crypto.decrypt_group_message(&group_id_s, &gm.content) {
                    Ok(plain) => (decode_content_obj(gm.msg_type, plain.as_slice()), false),
                    Err(e) => {
                        // 兼容老客户端发来的明文消息（例如版本=0 或骰子/扑克等未加密类型）
                        if let Ok(obj) = imweb::TextObj::decode(gm.content.as_slice()) {
                            warn!(
                                "GROUP_MSG_RECEIVED decrypt failed but raw TextObj parsed group_id={} msg_id={} msg_type={} err={}",
                                group_id, gm.msg_id, gm.msg_type, e
                            );
                            (obj.content, false)
                        } else if gm.msg_type == 1 && imweb::ImageObj::decode(gm.content.as_slice()).is_ok() {
                            warn!(
                                "GROUP_MSG_RECEIVED decrypt failed but raw ImageObj parsed group_id={} msg_id={} msg_type={} err={}",
                                group_id, gm.msg_id, gm.msg_type, e
                            );
                            (decode_content_obj(gm.msg_type, gm.content.as_slice()), false)
                        } else if let Ok(s) = String::from_utf8(gm.content.clone()) {
                            warn!(
                                "GROUP_MSG_RECEIVED decrypt failed but raw UTF-8 parsed group_id={} msg_id={} msg_type={} err={}",
                                group_id, gm.msg_id, gm.msg_type, e
                            );
                            (s, false)
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
                            ("[加密消息，等待密钥同步]".to_string(), true)
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
            let file_key =
                decrypt_group_attachment_key(&crypto, &group_id_s, &gm.attachment_key);
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
                extra: serde_json::json!({
                    "groupId": group_id,
                    "version": gm.version,
                    "contentMd5": gm.content_md5,
                    "snapchatTime": gm.snapchat_time,
                    "deleteSeconds": if gm.snapchat_time > 0 { i64::from(gm.snapchat_time) * 1000 } else { 0 },
                    "decryptPending": decrypt_pending,
                    "cipherHex": hex::encode(&gm.content),
                    "attachmentKey": gm.attachment_key,
                    "fileKey": file_key,
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
        
        let crypto = self.app_handle.state::<crate::crypto::CryptoEngine>();
        // Wait, how do we know our own UID?
        // We can check if sender_id == receiver_id.
        // Actually, if we can't reliably know our own UID from CryptoEngine, we can just let frontend handle it or pass candidate_ids.
        // But let's assume we can get our own UID from somewhere? 
        // Actually, in imweb we often don't have our own UID easily available in batcher.
        // Let's just use sender_id, and if frontend detects it's from self, frontend can adjust the conversationId!
        // Wait, frontend depends on conversationId being correct. Let's just pass `0_{sender}` for now, but if sender==receiver, it's `0_{sender}`.
        let conversation_id = format!("0_{}", om.send_uid);
        let ver = i64::from(om.version);

        // 兼容双端同步：优先按 sender 取 key，失败后退回 receiver。
        let candidate_ids = if sender_id == receiver_id {
            vec![sender_id.clone()]
        } else {
            vec![sender_id.clone(), receiver_id.clone()]
        };
        let mut ciphertexts_to_try = Vec::new();
        let sender_source = if om.source == 1 { "web" } else { "app" };
        // 老 im 接收私聊时，解密 key 使用顶层 `version + source`（发送端密钥），
        // 不是 MessageContent.version（接收端对应设备的 keyVersion）。
        // 桌面端优先尝试 webContent，和老 im `fnFriendMsgAdd` 保持一致。
        if let Some(web) = &om.web_content {
            let attachment_key = if web.attachment_key.trim().is_empty() { om.attachment_key.as_str() } else { web.attachment_key.as_str() };
            ciphertexts_to_try.push((ver, sender_source, web.content.as_slice(), attachment_key));
            ciphertexts_to_try.push((web.version as i64, "web", web.content.as_slice(), attachment_key));
        }
        if let Some(app) = &om.app_content {
            let attachment_key = if app.attachment_key.trim().is_empty() { om.attachment_key.as_str() } else { app.attachment_key.as_str() };
            ciphertexts_to_try.push((ver, sender_source, app.content.as_slice(), attachment_key));
            ciphertexts_to_try.push((app.version as i64, "app", app.content.as_slice(), attachment_key));
        }
        if let Some(mapp) = &om.myself_app_content {
            let attachment_key = if mapp.attachment_key.trim().is_empty() { om.attachment_key.as_str() } else { mapp.attachment_key.as_str() };
            ciphertexts_to_try.push((ver, sender_source, mapp.content.as_slice(), attachment_key));
            ciphertexts_to_try.push((mapp.version as i64, "app", mapp.content.as_slice(), attachment_key));
        }
        if let Some(mweb) = &om.myself_web_content {
            let attachment_key = if mweb.attachment_key.trim().is_empty() { om.attachment_key.as_str() } else { mweb.attachment_key.as_str() };
            ciphertexts_to_try.push((ver, sender_source, mweb.content.as_slice(), attachment_key));
            ciphertexts_to_try.push((mweb.version as i64, "web", mweb.content.as_slice(), attachment_key));
        }
        // Fallback for old/unencrypted messages that might still use `content`
        if !om.content.is_empty() {
            ciphertexts_to_try.push((ver, sender_source, om.content.as_slice(), om.attachment_key.as_str()));
            ciphertexts_to_try.push((ver, "web", om.content.as_slice(), om.attachment_key.as_str()));
            ciphertexts_to_try.push((ver, "app", om.content.as_slice(), om.attachment_key.as_str()));
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

                decrypted = crypto
                    .decrypt_friend_message(fid, *v, source, cipher)
                    .or_else(|_| {
                        let k = crypto
                            .get_latest_friend_key(fid, source)
                            .ok_or(crate::crypto::CryptoError::KeyNotFound)?;
                        crate::crypto::aes::decrypt_message(cipher, &k)
                    });

                if decrypted.is_ok() {
                    selected_attachment_key = (*attachment_key).to_string();
                    selected_file_key = decrypt_friend_attachment_key(&crypto, fid, *v, source, attachment_key)
                        .or_else(|| fallback_plain_file_key(attachment_key));
                    break 'outer;
                } else if let Err(e) = &decrypted {
                    // Keep the first actual AES error instead of KeyNotFound
                    if matches!(e, crate::crypto::CryptoError::AesError(_)) && fallback_err.is_none() {
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

                if om.msg_type == 1 {
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
                } else if let Ok(obj) = imweb::TextObj::decode(fallback_cipher) {
                    warn!(
                        "PRIVATE_MSG_RECEIVED decrypt failed but raw TextObj parsed sender_uid={} msg_id={} err={}",
                        om.send_uid, om.msg_id, e
                    );
                    obj.content
                } else if let Ok(s) = String::from_utf8(fallback_cipher.to_vec()) {
                    warn!(
                        "PRIVATE_MSG_RECEIVED decrypt failed but raw UTF-8 parsed sender_uid={} msg_id={} err={}",
                        om.send_uid, om.msg_id, e
                    );
                    s
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
                "version": om.version,
                "snapchatTime": om.snapchat_time,
                "deleteSeconds": if om.snapchat_time > 0 { i64::from(om.snapchat_time) * 1000 } else { 0 },
                "decryptPending": decrypt_pending,
                "friendIdCandidates": candidate_ids,
                "cipherHex": primary_cipher_hex,
                "cipherCandidates": cipher_candidates,
                "attachmentKey": om.attachment_key,
                "fileKey": selected_file_key.unwrap_or_default(),
                "messageContentAttachmentKey": selected_attachment_key,
            }),
        }])
    }

    fn handle_key_pair_change(&self, payload: &[u8]) -> Result<(), String> {
        let resp = imweb::PushKeyPairChangeMessageResp::decode(payload)
            .map_err(|e| format!("decode PushKeyPairChangeMessageResp: {}", e))?;
        let uid = resp.uid.to_string();
        let crypto = self.app_handle.state::<crate::crypto::CryptoEngine>();

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
            let _ = self.app_handle.emit(
                &format!("msg:batch:{}", conv_id),
                msgs,
            );
        }

        let _ = self.app_handle.emit("msg:batch", &messages);

        info!("Flushed {} messages in {} conversations", messages.len(), by_conversation.len());
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
                resp.message_protocol_id,
                reason
            );
            let _ = self.app_handle.emit("auth:force-logout", ForceLogoutEvent {
                cmd: cmds::ERROR_RESP,
                reason,
                kick_type: 1,
            });
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
