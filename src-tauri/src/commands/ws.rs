use tauri::State;

use crate::ws::WsManager;

#[tauri::command]
pub async fn connect_ws(
    ws_mgr: State<'_, WsManager>,
    url: String,
    aes_key: String,
    session_id: Option<String>,
    install_code: Option<String>,
    uid: Option<String>,
) -> Result<(), String> {
    tracing::info!(
        target: "ws",
        "connect_ws called url={} aes_key_len={}",
        url,
        aes_key.len()
    );
    if url.contains("webbiz") {
        tracing::warn!(
            target: "ws",
            "connect_ws uses webbiz host (likely wrong for websocket): {}",
            url
        );
    }
    ws_mgr
        .connect(&url, &aes_key, session_id, install_code, uid)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn disconnect_ws(ws_mgr: State<'_, WsManager>) -> Result<(), String> {
    ws_mgr.disconnect().await;
    Ok(())
}

#[tauri::command]
pub async fn get_ws_status(ws_mgr: State<'_, WsManager>) -> Result<String, String> {
    let status = ws_mgr.get_status();
    Ok(match status {
        crate::ws::ConnectionStatus::Disconnected => "disconnected",
        crate::ws::ConnectionStatus::Connecting => "connecting",
        crate::ws::ConnectionStatus::Connected => "connected",
        crate::ws::ConnectionStatus::Reconnecting => "reconnecting",
    }
    .to_string())
}

#[tauri::command]
pub async fn get_ws_diagnostics(
    ws_mgr: State<'_, WsManager>,
) -> Result<crate::ws::WsDiagnostics, String> {
    // 对齐老 im 网络诊断：提供最近重连、Socket close/error 和连接事件摘要给诊断弹窗展示。
    Ok(ws_mgr.get_diagnostics())
}
