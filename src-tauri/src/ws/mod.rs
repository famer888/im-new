mod batcher;
mod connection;
mod handler;

use dashmap::DashMap;
use parking_lot::RwLock;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::mpsc;

use crate::crypto::CryptoEngine;

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
    pending_messages: Arc<DashMap<String, PendingMessage>>,
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
            pending_messages: Arc::new(DashMap::new()),
        }
    }

    pub async fn connect(&self, url: &str, aes_key: &str) -> Result<(), WsError> {
        let current = *self.status.read();
        if current == ConnectionStatus::Connected || current == ConnectionStatus::Connecting {
            return Ok(());
        }

        *self.status.write() = ConnectionStatus::Connecting;
        self.emit_status(ConnectionStatus::Connecting);

        let url = url.to_string();
        let aes_key = aes_key.to_string();
        let status = self.status.clone();
        let send_tx = self.send_tx.clone();
        let app_handle = self.app_handle.clone();
        let reconnect_count = self.reconnect_count.clone();
        let pending = self.pending_messages.clone();

        let handle = tokio::spawn(async move {
            connection::run_connection(
                &url,
                &aes_key,
                status,
                send_tx,
                app_handle,
                reconnect_count,
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
        self.reconnect_count
            .store(0, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn send(&self, data: Vec<u8>) -> Result<(), WsError> {
        let tx = self.send_tx.read();
        match tx.as_ref() {
            Some(tx) => tx.send(data).map_err(|_| WsError::SendFailed),
            None => Err(WsError::NotConnected),
        }
    }

    pub fn get_status(&self) -> ConnectionStatus {
        *self.status.read()
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
    }
}

fn build_heartbeat_packet() -> Vec<u8> {
    let cmd: u16 = 19901;
    let mut packet = Vec::with_capacity(16);
    packet.push(0x01); // isJM
    packet.push(0x00); // isZip
    packet.extend_from_slice(&cmd.to_be_bytes());
    packet.extend_from_slice(&0u32.to_be_bytes()); // length
    packet.extend_from_slice(&(cmd as u64).to_be_bytes()); // cmd id
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
}

impl serde::Serialize for WsError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
