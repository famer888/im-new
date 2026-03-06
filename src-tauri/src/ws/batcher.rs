use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use tokio::time::{Duration, Instant};
use tracing::{error, info};

use crate::crypto;

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
    pub extra: serde_json::Value,
}

pub struct MessageBatcher {
    buffer: Vec<DecodedMessage>,
    last_flush: Instant,
    app_handle: AppHandle,
    aes_key: String,
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

        match self.decode_frame(&frame) {
            Ok(msg) => {
                self.buffer.push(msg);
            }
            Err(e) => {
                error!("Failed to decode frame: {}", e);
                return;
            }
        }

        if self.buffer.len() >= MAX_BATCH_SIZE
            || self.last_flush.elapsed() >= Duration::from_millis(FLUSH_INTERVAL_MS)
        {
            self.flush().await;
        }
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

    fn decode_frame(&self, frame: &[u8]) -> Result<DecodedMessage, String> {
        let _is_encrypted = frame[0];
        let _is_compressed = frame[1];
        let cmd = u16::from_be_bytes([frame[2], frame[3]]);
        let _length = u32::from_be_bytes([frame[4], frame[5], frame[6], frame[7]]);
        let payload = &frame[16..];

        let decrypted = crypto::aes::decrypt_ecb(payload, self.aes_key.as_bytes())
            .map_err(|e| format!("AES decrypt failed: {}", e))?;

        decode_by_cmd(cmd, &decrypted)
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

fn decode_by_cmd(cmd: u16, payload: &[u8]) -> Result<DecodedMessage, String> {
    match cmd {
        20001 => decode_one_to_one_message(payload),
        20102 => decode_group_message(payload),
        20202 => decode_channel_message(payload),
        _ => Ok(DecodedMessage {
            cmd,
            msg_id: String::new(),
            conversation_id: String::new(),
            sender_id: String::new(),
            msg_type: 0,
            content: String::new(),
            send_time: 0,
            extra: serde_json::Value::Null,
        }),
    }
}

fn decode_one_to_one_message(payload: &[u8]) -> Result<DecodedMessage, String> {
    // prost decode: OneToOneMessage
    // Placeholder: actual prost decoding goes here
    Ok(DecodedMessage {
        cmd: 20001,
        msg_id: String::new(),
        conversation_id: String::new(),
        sender_id: String::new(),
        msg_type: 0,
        content: String::new(),
        send_time: 0,
        extra: serde_json::Value::Null,
    })
}

fn decode_group_message(payload: &[u8]) -> Result<DecodedMessage, String> {
    Ok(DecodedMessage {
        cmd: 20102,
        msg_id: String::new(),
        conversation_id: String::new(),
        sender_id: String::new(),
        msg_type: 0,
        content: String::new(),
        send_time: 0,
        extra: serde_json::Value::Null,
    })
}

fn decode_channel_message(payload: &[u8]) -> Result<DecodedMessage, String> {
    Ok(DecodedMessage {
        cmd: 20202,
        msg_id: String::new(),
        conversation_id: String::new(),
        sender_id: String::new(),
        msg_type: 0,
        content: String::new(),
        send_time: 0,
        extra: serde_json::Value::Null,
    })
}
