mod batcher;
pub mod codec;
pub mod commands;
mod connection;
mod handler;

use dashmap::DashMap;
use parking_lot::RwLock;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
}

pub struct WsManager {
    app_handle: AppHandle,
    status: Arc<RwLock<ConnectionStatus>>,
    send_tx: Arc<RwLock<Option<mpsc::UnboundedSender<Vec<u8>>>>>,
    heartbeat_handle: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
    connection_handle: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
    reconnect_count: Arc<std::sync::atomic::AtomicU32>,
    diagnostics: Arc<RwLock<WsDiagnostics>>,
    pending_messages: Arc<DashMap<String, PendingMessage>>,
    /// AES 传输密钥：帧头 16 字节后的 protobuf 载荷用它做 AES-128-ECB 加解密。
    /// 与老 im 的 `configs.TRENDS_AES_KEY || AES_KEY` 等价，`connect` 时写入。
    aes_key: Arc<RwLock<Option<String>>>,
    /// WS 登录上下文：用于连接建立后立刻发送 10001 LoginReq。
    session_id: Arc<RwLock<String>>,
    install_code: Arc<RwLock<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WsEventLine {
    pub time: i64,
    pub event: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WsCloseRecord {
    pub time: i64,
    pub url: String,
    pub code: String,
    pub reason: String,
    pub was_clean: Option<bool>,
    pub unexpected: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WsErrorRecord {
    pub time: i64,
    pub url: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WsDiagnostics {
    pub reconnect_times: Vec<i64>,
    pub last_close: Option<WsCloseRecord>,
    pub last_error: Option<WsErrorRecord>,
    pub events: Vec<WsEventLine>,
}

#[derive(Debug)]
struct PendingMessage {
    cmd: u16,
    data: Vec<u8>,
    timestamp: i64,
    retries: u32,
}

impl WsManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            status: Arc::new(RwLock::new(ConnectionStatus::Disconnected)),
            send_tx: Arc::new(RwLock::new(None)),
            heartbeat_handle: Arc::new(RwLock::new(None)),
            connection_handle: Arc::new(RwLock::new(None)),
            reconnect_count: Arc::new(std::sync::atomic::AtomicU32::new(0)),
            diagnostics: Arc::new(RwLock::new(WsDiagnostics::default())),
            pending_messages: Arc::new(DashMap::new()),
            aes_key: Arc::new(RwLock::new(None)),
            session_id: Arc::new(RwLock::new(String::new())),
            install_code: Arc::new(RwLock::new(String::new())),
        }
    }

    pub async fn connect(
        &self,
        url: &str,
        aes_key: &str,
        session_id: Option<String>,
        install_code: Option<String>,
        uid: Option<String>,
    ) -> Result<(), WsError> {
        if url.trim().is_empty() {
            *self.status.write() = ConnectionStatus::Disconnected;
            self.emit_status(ConnectionStatus::Disconnected);
            return Err(WsError::ConnectionFailed("empty websocket url".to_string()));
        }

        let current = *self.status.read();
        if current == ConnectionStatus::Connected
            || current == ConnectionStatus::Connecting
            || current == ConnectionStatus::Reconnecting
        {
            return Ok(());
        }

        *self.status.write() = ConnectionStatus::Connecting;
        self.emit_status(ConnectionStatus::Connecting);
        self.record_event("CONNECT_START", url);

        *self.aes_key.write() = Some(aes_key.to_string());
        *self.session_id.write() = session_id.unwrap_or_default();
        *self.install_code.write() = install_code.unwrap_or_default();

        let url = url.to_string();
        let aes_key = aes_key.to_string();
        let status = self.status.clone();
        let send_tx = self.send_tx.clone();
        let app_handle = self.app_handle.clone();
        let reconnect_count = self.reconnect_count.clone();
        let diagnostics = self.diagnostics.clone();
        let pending = self.pending_messages.clone();
        let session_id = self.session_id.clone();
        let install_code = self.install_code.clone();
        let uid = uid.unwrap_or_default();

        let handle = tokio::spawn(async move {
            connection::run_connection(
                &url,
                &aes_key,
                uid,
                session_id,
                install_code,
                status,
                send_tx,
                app_handle,
                reconnect_count,
                diagnostics,
                pending,
            )
            .await;
        });

        *self.connection_handle.write() = Some(handle);

        self.start_heartbeat();
        Ok(())
    }

    pub async fn disconnect(&self) {
        *self.status.write() = ConnectionStatus::Disconnected;
        self.emit_status(ConnectionStatus::Disconnected);

        if let Some(handle) = self.heartbeat_handle.write().take() {
            handle.abort();
        }
        if let Some(handle) = self.connection_handle.write().take() {
            handle.abort();
        }
        *self.send_tx.write() = None;
        *self.aes_key.write() = None;
        *self.session_id.write() = String::new();
        *self.install_code.write() = String::new();
        self.reconnect_count
            .store(0, std::sync::atomic::Ordering::Relaxed);
        self.record_event("DISCONNECT", "manual disconnect");
    }

    pub fn send(&self, data: Vec<u8>) -> Result<(), WsError> {
        let tx = self.send_tx.read();
        match tx.as_ref() {
            Some(tx) => tx.send(data).map_err(|_| WsError::SendFailed),
            None => Err(WsError::NotConnected),
        }
    }

    /// 按老 im `initHeader` 格式打包一条 WS 请求：AES 加密 protobuf 载荷 +
    /// 16 字节帧头（isJM / isZip / cmd / len / msg_id）后直接压入发送通道。
    pub fn send_packet(
        &self,
        cmd: u16,
        msg_id: i64,
        protobuf_payload: &[u8],
    ) -> Result<(), WsError> {
        let aes_key = self.aes_key.read().clone().ok_or(WsError::NotConnected)?;

        // mac 段目前按老 im WEB 默认行为不带（老 im 仅在 `TRENDS_AES_KEY` 配置下带 mac）。
        let packet = codec::encode_packet(cmd, msg_id, protobuf_payload, &aes_key, None)?;
        self.send(packet)
    }

    pub fn get_status(&self) -> ConnectionStatus {
        *self.status.read()
    }

    pub fn get_diagnostics(&self) -> WsDiagnostics {
        self.diagnostics.read().clone()
    }

    fn start_heartbeat(&self) {
        if let Some(handle) = self.heartbeat_handle.write().take() {
            handle.abort();
        }

        let status = self.status.clone();
        let send_tx = self.send_tx.clone();

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(3));
            loop {
                interval.tick().await;
                let current = *status.read();
                if current != ConnectionStatus::Connected {
                    continue;
                }
                if let Some(tx) = send_tx.read().as_ref() {
                    let heartbeat = build_heartbeat_packet();
                    let _ = tx.send(heartbeat);
                }
            }
        });

        *self.heartbeat_handle.write() = Some(handle);
    }

    fn emit_status(&self, status: ConnectionStatus) {
        let status_str = match status {
            ConnectionStatus::Disconnected => "disconnected",
            ConnectionStatus::Connecting => "connecting",
            ConnectionStatus::Connected => "connected",
            ConnectionStatus::Reconnecting => "reconnecting",
        };
        let _ = self.app_handle.emit("ws:status", status_str);
        self.record_event("STATUS", status_str);
    }

    fn record_event(&self, event: &str, detail: &str) {
        push_ws_event(&self.diagnostics, event, detail);
    }
}

pub(crate) fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub(crate) fn push_ws_event(diagnostics: &Arc<RwLock<WsDiagnostics>>, event: &str, detail: &str) {
    let mut diag = diagnostics.write();
    diag.events.push(WsEventLine {
        time: now_millis(),
        event: event.to_string(),
        detail: detail.to_string(),
    });
    let len = diag.events.len();
    if len > 80 {
        let drop_count = len - 80;
        diag.events.drain(0..drop_count);
    }
}

pub(crate) fn record_ws_reconnect(diagnostics: &Arc<RwLock<WsDiagnostics>>, detail: &str) {
    let mut diag = diagnostics.write();
    let now = now_millis();
    diag.reconnect_times.push(now);
    diag.reconnect_times
        .retain(|time| now - *time <= 5 * 60 * 1000);
    diag.events.push(WsEventLine {
        time: now,
        event: "RECONNECT".to_string(),
        detail: detail.to_string(),
    });
    let len = diag.events.len();
    if len > 80 {
        let drop_count = len - 80;
        diag.events.drain(0..drop_count);
    }
}

fn build_heartbeat_packet() -> Vec<u8> {
    let cmd = commands::HEARTBEAT;
    let mut packet = Vec::with_capacity(16);
    packet.push(0x01); // isJM
    packet.push(0x00); // isZip
    packet.extend_from_slice(&cmd.to_be_bytes());
    packet.extend_from_slice(&0u32.to_be_bytes());
    packet.extend_from_slice(&(cmd as u64).to_be_bytes());
    packet
}

#[derive(Debug, thiserror::Error)]
pub enum WsError {
    #[error("WebSocket connection failed: {0}")]
    ConnectionFailed(String),
    #[error("Not connected")]
    NotConnected,
    #[error("Send failed")]
    SendFailed,
    #[error("Reconnecting")]
    Reconnecting,
    #[error("Packet decode error: {0}")]
    DecodeError(String),
    #[error("Encryption error: {0}")]
    EncryptionError(String),
}

impl serde::Serialize for WsError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
