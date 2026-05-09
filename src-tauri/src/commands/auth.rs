use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tracing::{info, warn};

use crate::config::ConfigManager;
use crate::db::DbManager;
use crate::window::WindowManager;

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    #[serde(default)]
    pub uid: String,
    #[serde(default)]
    pub nickname: String,
    #[serde(default)]
    pub avatar: String,
    #[serde(default)]
    pub source_id: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ActiveLoginLock {
    uid: String,
    nickname: String,
    session_id: String,
    pid: u32,
    created_at: i64,
}

fn active_login_lock_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("active-login.json"))
}

#[cfg(target_os = "windows")]
fn is_process_running(pid: u32) -> bool {
    if pid == std::process::id() {
        return true;
    }
    let output = std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {}", pid), "/FO", "CSV", "/NH"])
        .output();
    output
        .ok()
        .map(|out| {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .any(|line| line.contains(&format!(",\"{}\",", pid)) || line.contains(&format!("\"{}\"", pid)))
        })
        .unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
fn is_process_running(pid: u32) -> bool {
    if pid == std::process::id() {
        return true;
    }
    std::process::Command::new("kill")
        .arg("-0")
        .arg(pid.to_string())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn read_active_login_lock(path: &PathBuf) -> Option<ActiveLoginLock> {
    let data = std::fs::read_to_string(path).ok()?;
    serde_json::from_str::<ActiveLoginLock>(&data).ok()
}

fn show_single_account_warning(app: &tauri::AppHandle, active: &ActiveLoginLock) {
    let account_text = if active.uid.trim().is_empty() {
        "当前已有账号".to_string()
    } else if active.nickname.trim().is_empty() {
        format!("账号 {}", active.uid)
    } else {
        format!("账号 {} ({})", active.nickname, active.uid)
    };
    app.dialog()
        .message(format!(
            "同一台电脑只能同时登录一个账号。\n\n{} 正在登录中，请先在已打开的 OCS Chat 中退出当前账号后再登录。",
            account_text
        ))
        .title("登录提醒")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCustom("我知道了".to_string()))
        .show(|_| {});
}

fn acquire_active_login_lock(
    app: &tauri::AppHandle,
    request: &LoginRequest,
) -> Result<(), String> {
    let path = active_login_lock_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    if let Some(active) = read_active_login_lock(&path) {
        if active.pid != std::process::id() && is_process_running(active.pid) {
            show_single_account_warning(app, &active);
            return Err("同一台电脑只能同时登录一个账号，请先退出已登录账号".to_string());
        }
        let _ = std::fs::remove_file(&path);
    }

    let lock = ActiveLoginLock {
        uid: request.uid.trim().to_string(),
        nickname: request.nickname.trim().to_string(),
        session_id: request.session_id.trim().to_string(),
        pid: std::process::id(),
        created_at: chrono::Utc::now().timestamp_millis(),
    };
    let data = serde_json::to_string_pretty(&lock).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ensure_can_login_on_this_machine(app: tauri::AppHandle) -> Result<bool, String> {
    let path = active_login_lock_path(&app)?;
    if let Some(active) = read_active_login_lock(&path) {
        if active.pid != std::process::id() && is_process_running(active.pid) {
            return Ok(false);
        }
        let _ = std::fs::remove_file(path);
    }

    Ok(true)
}

fn release_active_login_lock(app: &tauri::AppHandle, uid: Option<&str>) {
    let Ok(path) = active_login_lock_path(app) else {
        return;
    };
    let Some(active) = read_active_login_lock(&path) else {
        return;
    };
    let uid_matches = uid
        .map(str::trim)
        .filter(|uid| !uid.is_empty())
        .map(|uid| uid == active.uid)
        .unwrap_or(true);
    if active.pid == std::process::id() && uid_matches {
        let _ = std::fs::remove_file(path);
    }
}

#[tauri::command]
pub async fn login(
    app: tauri::AppHandle,
    _db: State<'_, DbManager>,
    win_mgr: State<'_, WindowManager>,
    request: LoginRequest,
) -> Result<SessionInfo, String> {
    acquire_active_login_lock(&app, &request)?;

    // 1. Initialize database for user
    // 2. Connect WebSocket
    // 3. Switch to main window
    // Placeholder implementation
    win_mgr
        .switch_to_main(&app)
        .map_err(|e| e.to_string())?;

    Ok(SessionInfo {
        uid: request.uid,
        session_id: request.session_id,
        nickname: request.nickname,
        avatar: request.avatar,
        source_id: request.source_id,
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
    release_active_login_lock(&app, uid.as_deref());

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
