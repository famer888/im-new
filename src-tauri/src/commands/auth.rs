use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::DbManager;
use crate::window::WindowManager;

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    pub session_url: String,
    pub ws_url: String,
    pub aes_key: String,
    pub install_code: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionInfo {
    pub uid: String,
    pub session_id: String,
    pub nickname: String,
    pub avatar: String,
}

#[tauri::command]
pub async fn login(
    app: tauri::AppHandle,
    db: State<'_, DbManager>,
    win_mgr: State<'_, WindowManager>,
    request: LoginRequest,
) -> Result<SessionInfo, String> {
    // 1. Initialize database for user
    // 2. Connect WebSocket
    // 3. Switch to main window
    // Placeholder implementation
    win_mgr
        .switch_to_main(&app)
        .map_err(|e| e.to_string())?;

    Ok(SessionInfo {
        uid: String::new(),
        session_id: String::new(),
        nickname: String::new(),
        avatar: String::new(),
    })
}

#[tauri::command]
pub async fn logout(
    app: tauri::AppHandle,
    win_mgr: State<'_, WindowManager>,
    ws_mgr: State<'_, crate::ws::WsManager>,
) -> Result<(), String> {
    ws_mgr.disconnect().await;
    win_mgr
        .switch_to_login(&app)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_session() -> Result<Option<SessionInfo>, String> {
    // Check local stored session
    Ok(None)
}
