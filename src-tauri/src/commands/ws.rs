use tauri::State;

use crate::ws::WsManager;

#[tauri::command]
pub async fn connect_ws(
    ws_mgr: State<'_, WsManager>,
    url: String,
    aes_key: String,
) -> Result<(), String> {
    ws_mgr
        .connect(&url, &aes_key)
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
