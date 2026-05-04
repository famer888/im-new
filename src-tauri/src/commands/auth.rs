use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{info, warn};

use crate::config::ConfigManager;
use crate::db::DbManager;
use crate::window::WindowManager;

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    #[serde(default)]
    pub session_url: String,
    #[serde(default)]
    pub ws_url: String,
    #[serde(default)]
    pub aes_key: String,
    #[serde(default)]
    pub install_code: String,
    #[serde(default)]
    pub session_id: String,
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
    _db: State<'_, DbManager>,
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
        session_id: request.session_id,
        nickname: String::new(),
        avatar: String::new(),
    })
}

#[tauri::command]
pub async fn logout(
    app: tauri::AppHandle,
    config: State<'_, ConfigManager>,
    db: State<'_, DbManager>,
    win_mgr: State<'_, WindowManager>,
    ws_mgr: State<'_, crate::ws::WsManager>,
    uid: Option<String>,
) -> Result<(), String> {
    info!("logout requested uid={:?}", uid);
    ws_mgr.disconnect().await;

    if let Some(uid) = uid.as_deref().map(str::trim).filter(|uid| !uid.is_empty()) {
        let keep_history = config
            .get_settings()
            .map_err(|e| e.to_string())?
            .keep_history_on_logout;

        info!(
            "logout resolved uid={} keep_history_on_logout={}",
            uid, keep_history
        );

        if keep_history {
            info!("logout keep history enabled, closing db only uid={}", uid);
            db.close(uid);
        } else {
            info!("logout keep history disabled, deleting user db uid={}", uid);
            db.delete_user_database(uid).map_err(|e| e.to_string())?;
        }
    } else {
        warn!("logout missing uid, skip local db cleanup");
    }

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
