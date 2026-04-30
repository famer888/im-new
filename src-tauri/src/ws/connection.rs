use super::{batcher::MessageBatcher, ConnectionStatus, PendingMessage, WsError};
use crate::proto::imweb;
use crate::ws::{codec, commands};
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use prost::Message as _;
use parking_lot::RwLock;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{error, info, warn};

const RECONNECT_DELAY_MS: u64 = 4000;
const FAST_RECONNECT_DELAY_MS: u64 = 300;
const MAX_RECONNECT_ATTEMPTS: u32 = 100;

#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ForceLogoutEvent {
    cmd: u16,
    reason: String,
    kick_type: i32,
}

pub async fn run_connection(
    url: &str,
    aes_key: &str,
    session_id: Arc<RwLock<String>>,
    install_code: Arc<RwLock<String>>,
    status: Arc<RwLock<ConnectionStatus>>,
    send_tx: Arc<RwLock<Option<mpsc::UnboundedSender<Vec<u8>>>>>,
    app_handle: AppHandle,
    reconnect_count: Arc<std::sync::atomic::AtomicU32>,
    pending: Arc<DashMap<String, PendingMessage>>,
) {
    let current_url = url.to_string();
    let aes_key = aes_key.to_string();

    loop {
        let current_status = *status.read();
        if current_status == ConnectionStatus::Disconnected {
            info!("WebSocket disconnected by user, stopping reconnect loop");
            break;
        }

        let unexpected_disconnect = match connect_and_run(
            &current_url,
            &aes_key,
            &session_id,
            &install_code,
            &status,
            &send_tx,
            &app_handle,
            &pending,
        )
        .await
        {
            Ok(()) => {
                info!("WebSocket connection closed normally");
                false
            }
            Err(e) => {
                error!("WebSocket error: {}", e);
                true
            }
        };

        let current_status = *status.read();
        if current_status == ConnectionStatus::Disconnected {
            break;
        }

        let count = reconnect_count.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        if count >= MAX_RECONNECT_ATTEMPTS {
            error!("Max reconnect attempts reached");
            *status.write() = ConnectionStatus::Disconnected;
            let _ = app_handle.emit("ws:status", "disconnected");
            let _ = app_handle.emit("ws:error", "max_reconnect_reached");
            break;
        }

        *status.write() = ConnectionStatus::Reconnecting;
        let _ = app_handle.emit("ws:status", "reconnecting");

        let delay_ms = if unexpected_disconnect && count == 0 {
            FAST_RECONNECT_DELAY_MS
        } else {
            RECONNECT_DELAY_MS
        };
        warn!("Reconnecting in {}ms (attempt {})", delay_ms, count + 1);
        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
    }
}

async fn connect_and_run(
    url: &str,
    aes_key: &str,
    session_id: &Arc<RwLock<String>>,
    install_code: &Arc<RwLock<String>>,
    status: &Arc<RwLock<ConnectionStatus>>,
    send_tx: &Arc<RwLock<Option<mpsc::UnboundedSender<Vec<u8>>>>>,
    app_handle: &AppHandle,
    pending: &Arc<DashMap<String, PendingMessage>>,
) -> Result<(), WsError> {
    info!("Connecting to WebSocket: {}", url);

    let (ws_stream, _) = connect_async(url)
        .await
        .map_err(|e| WsError::ConnectionFailed(e.to_string()))?;

    info!("WebSocket connected");
    *status.write() = ConnectionStatus::Connected;
    let _ = app_handle.emit("ws:status", "connected");

    let (mut ws_sink, mut ws_stream_reader) = ws_stream.split();

    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
    *send_tx.write() = Some(tx);

    // 对齐老 im：连接建立后立即发送 10001 登录包，确保后续 10201 可被服务端接受。
    let sid = session_id.read().clone();
    let code = install_code.read().clone();
    let login_packet = build_login_packet(aes_key, &sid, &code)?;
    ws_sink
        .send(Message::Binary(login_packet.into()))
        .await
        .map_err(|e| WsError::SendFailed)?;
    info!(
        "WebSocket login packet sent cmd=10001 session_id_len={} install_code_len={}",
        sid.len(),
        code.len()
    );

    let mut batcher = MessageBatcher::new(app_handle.clone(), aes_key.to_string());

    let mut unexpected_disconnect: Option<String> = None;

    loop {
        tokio::select! {
            msg = ws_stream_reader.next() => {
                match msg {
                    Some(Ok(Message::Binary(data))) => {
                        batcher.push(data.to_vec()).await;
                    }
                    Some(Ok(Message::Close(frame))) => {
                        let (close_code, close_reason) = frame
                            .as_ref()
                            .map(|f| (format!("{:?}", f.code), f.reason.to_string()))
                            .unwrap_or_else(|| ("none".to_string(), String::new()));
                        warn!(
                            "WebSocket closed by server code={} reason={}",
                            close_code,
                            close_reason
                        );
                        *status.write() = ConnectionStatus::Disconnected;
                        let reason = if close_reason.trim().is_empty() {
                            "账号已在其他设备登录".to_string()
                        } else {
                            close_reason
                        };
                        let _ = app_handle.emit("auth:force-logout", ForceLogoutEvent {
                            cmd: commands::FORCE_LOGOUT,
                            reason,
                            kick_type: 1,
                        });
                        let _ = app_handle.emit("ws:status", "disconnected");
                        break;
                    }
                    Some(Err(e)) => {
                        error!("WebSocket read error: {}", e);
                        unexpected_disconnect = Some(e.to_string());
                        break;
                    }
                    None => {
                        info!("WebSocket stream ended");
                        break;
                    }
                    _ => {}
                }
            }
            Some(data) = rx.recv() => {
                if data.len() >= 16 {
                    let cmd = u16::from_be_bytes([data[2], data[3]]);
                    if matches!(cmd, commands::SEND_CHANNEL_MSG | commands::RECALL_CHANNEL_MSG | commands::READ_CHANNEL_MSG) {
                        let msg_id = i64::from_be_bytes([
                            data[8], data[9], data[10], data[11],
                            data[12], data[13], data[14], data[15],
                        ]);
                        info!(
                            "[channel] WS frame sending cmd={} msg_id={} bytes={}",
                            cmd,
                            msg_id,
                            data.len()
                        );
                    }
                }
                if let Err(e) = ws_sink.send(Message::Binary(data.into())).await {
                    error!("WebSocket send error: {}", e);
                    unexpected_disconnect = Some(e.to_string());
                    break;
                }
            }
        }
    }

    batcher.flush().await;
    *send_tx.write() = None;
    if let Some(detail) = unexpected_disconnect {
        return Err(WsError::ConnectionFailed(detail));
    }
    Ok(())
}

fn build_login_packet(aes_key: &str, session_id: &str, install_code: &str) -> Result<Vec<u8>, WsError> {
    let req = imweb::LoginReq {
        client_info: Some(imweb::ClientInfo {
            session_id: session_id.to_string(),
            app_ver: 168,
            package_code: 7100,
            plat: 4, // Platform::WIN（与老 im 保持一致）
            language: 2,
            sys_mac: String::new(),
            sys_model: "MAC".to_string(),
        }),
        install_code: install_code.to_string(),
    };
    let payload = req.encode_to_vec();
    let msg_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(commands::LOGIN as i64);
    codec::encode_packet(commands::LOGIN, msg_id, &payload, aes_key, None)
}
