use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    LazyLock,
};
use tauri::{Emitter, Manager, State};
use tracing::{info, warn};

use crate::config::ConfigManager;
use crate::db::DbManager;
use crate::window::WindowManager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

static ACTIVE_LOGIN_MONITOR_STARTED: AtomicBool = AtomicBool::new(false);
static CURRENT_PROCESS_LOGIN_UIDS: LazyLock<parking_lot::Mutex<HashSet<String>>> =
    LazyLock::new(|| parking_lot::Mutex::new(HashSet::new()));
static CURRENT_SESSION: LazyLock<parking_lot::RwLock<Option<SessionInfo>>> =
    LazyLock::new(|| parking_lot::RwLock::new(None));

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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
        .join("active-logins.json"))
}

fn legacy_active_login_lock_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
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
    let mut command = std::process::Command::new("tasklist");
    let output = command
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/FI", &format!("PID eq {}", pid), "/FO", "CSV", "/NH"])
        .output();
    output
        .ok()
        .map(|out| {
            String::from_utf8_lossy(&out.stdout).lines().any(|line| {
                line.contains(&format!(",\"{}\",", pid)) || line.contains(&format!("\"{}\"", pid))
            })
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

fn read_active_login_locks(path: &PathBuf) -> HashMap<String, ActiveLoginLock> {
    let Some(data) = std::fs::read_to_string(path).ok() else {
        return HashMap::new();
    };
    serde_json::from_str::<HashMap<String, ActiveLoginLock>>(&data).unwrap_or_default()
}

fn write_active_login_locks(
    path: &PathBuf,
    locks: &HashMap<String, ActiveLoginLock>,
) -> Result<(), String> {
    let data = serde_json::to_string_pretty(locks).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

fn remember_current_process_login(uid: &str) {
    let uid = uid.trim();
    if uid.is_empty() {
        return;
    }
    let mut uids = CURRENT_PROCESS_LOGIN_UIDS.lock();
    uids.clear();
    uids.insert(uid.to_string());
}

fn forget_current_process_login(uid: Option<&str>) {
    let mut uids = CURRENT_PROCESS_LOGIN_UIDS.lock();
    if let Some(uid) = uid.map(str::trim).filter(|uid| !uid.is_empty()) {
        uids.remove(uid);
    } else {
        uids.clear();
    }
}

pub fn start_active_login_monitor(app: tauri::AppHandle) {
    if ACTIVE_LOGIN_MONITOR_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(800));

        loop {
            interval.tick().await;

            let current_uids = {
                let uids = CURRENT_PROCESS_LOGIN_UIDS.lock();
                if uids.is_empty() {
                    continue;
                }
                uids.iter().cloned().collect::<Vec<_>>()
            };

            let Ok(path) = active_login_lock_path(&app) else {
                continue;
            };
            let locks = read_active_login_locks(&path);
            let current_pid = std::process::id();
            let replaced_uid = current_uids.into_iter().find(|uid| {
                locks
                    .get(uid)
                    .map(|active| active.pid != current_pid)
                    .unwrap_or(true)
            });

            let Some(uid) = replaced_uid else {
                continue;
            };

            forget_current_process_login(Some(&uid));
            warn!(
                "[AUTH-DIAG][auth.rs] active login lock uid={} was replaced by another process, forcing local logout",
                uid
            );
            warn!(
                "active login lock uid={} was replaced by another process, forcing local logout",
                uid
            );
            let _ = app.emit(
                "auth:force-logout",
                serde_json::json!({
                    "reason": "local-login-replaced",
                    "uid": uid,
                }),
            );
        }
    });
}

fn cleanup_legacy_active_login_lock(app: &tauri::AppHandle) {
    let Ok(path) = legacy_active_login_lock_path(app) else {
        return;
    };
    let Some(active) = read_active_login_lock(&path) else {
        let _ = std::fs::remove_file(path);
        return;
    };
    if active.pid == std::process::id() || !is_process_running(active.pid) {
        let _ = std::fs::remove_file(path);
    }
}

fn acquire_active_login_lock(app: &tauri::AppHandle, request: &LoginRequest) -> Result<(), String> {
    cleanup_legacy_active_login_lock(app);

    let path = active_login_lock_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let uid = request.uid.trim().to_string();
    let current_pid = std::process::id();
    let mut locks = read_active_login_locks(&path);
    locks.retain(|_, active| active.pid == current_pid || is_process_running(active.pid));
    if !uid.is_empty() {
        locks.retain(|active_uid, active| active.pid != current_pid || active_uid == &uid);
    }

    if !uid.is_empty() {
        if let Some(active) = locks.get(&uid) {
            if active.pid != current_pid && is_process_running(active.pid) {
                let requested_nickname = request.nickname.trim();
                let active_nickname = active.nickname.trim();
                if !requested_nickname.is_empty()
                    && !active_nickname.is_empty()
                    && requested_nickname != active_nickname
                {
                    warn!(
                        "active login lock uid={} nickname mismatch active={} requested={}, treat as stale",
                        uid, active_nickname, requested_nickname
                    );
                    locks.remove(&uid);
                } else {
                    warn!(
                        "active login lock uid={} pid={} will be replaced by pid={}",
                        uid, active.pid, current_pid
                    );
                }
            }
        }
    }

    if uid.is_empty() {
        return Ok(());
    }

    let lock = ActiveLoginLock {
        uid: uid.clone(),
        nickname: request.nickname.trim().to_string(),
        session_id: request.session_id.trim().to_string(),
        pid: current_pid,
        created_at: chrono::Utc::now().timestamp_millis(),
    };
    locks.insert(uid, lock);
    write_active_login_locks(&path, &locks)?;
    remember_current_process_login(request.uid.trim());
    Ok(())
}

#[tauri::command]
pub async fn ensure_can_login_on_this_machine(app: tauri::AppHandle) -> Result<bool, String> {
    cleanup_legacy_active_login_lock(&app);

    let path = active_login_lock_path(&app)?;
    let mut locks = read_active_login_locks(&path);
    let before = locks.len();
    locks.retain(|_, active| active.pid == std::process::id() || is_process_running(active.pid));
    if locks.len() != before {
        if locks.is_empty() {
            let _ = std::fs::remove_file(path);
        } else {
            write_active_login_locks(&path, &locks)?;
        }
    }

    Ok(true)
}

fn release_active_login_lock(app: &tauri::AppHandle, uid: Option<&str>) {
    forget_current_process_login(uid);

    let Ok(path) = active_login_lock_path(app) else {
        return;
    };
    let Some(active) = read_active_login_lock(&path) else {
        let mut locks = read_active_login_locks(&path);
        let before = locks.len();
        locks.retain(|_, active| {
            let uid_matches = uid
                .map(str::trim)
                .filter(|uid| !uid.is_empty())
                .map(|uid| uid == active.uid)
                .unwrap_or(true);
            !(active.pid == std::process::id() && uid_matches)
        });
        if locks.len() != before {
            if locks.is_empty() {
                let _ = std::fs::remove_file(path);
            } else {
                let _ = write_active_login_locks(&path, &locks);
            }
        }
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
    db: State<'_, DbManager>,
    win_mgr: State<'_, WindowManager>,
    request: LoginRequest,
) -> Result<SessionInfo, String> {
    info!(
        "[AUTH-DIAG][auth.rs] login requested uid={} has_session_id={} has_ws_url={} has_aes_key={} install_code_len={}",
        request.uid.trim(),
        !request.session_id.trim().is_empty(),
        !request.ws_url.trim().is_empty(),
        !request.aes_key.trim().is_empty(),
        request.install_code.trim().len()
    );
    acquire_active_login_lock(&app, &request)?;

    let uid = request.uid.trim();
    if !uid.is_empty() {
        if let Err(err) = db.get_or_create(uid) {
            release_active_login_lock(&app, Some(uid));
            return Err(err.to_string());
        }
    }

    win_mgr.switch_to_main(&app).map_err(|e| e.to_string())?;

    let session = SessionInfo {
        uid: request.uid,
        session_id: request.session_id,
        nickname: request.nickname,
        avatar: request.avatar,
        source_id: request.source_id,
    };
    *CURRENT_SESSION.write() = Some(session.clone());
    info!(
        "[AUTH-DIAG][auth.rs] login stored uid={} has_session_id={}",
        session.uid.trim(),
        !session.session_id.trim().is_empty()
    );

    Ok(session)
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
    info!("[AUTH-DIAG][auth.rs] logout requested uid={:?}", uid);
    info!("logout requested uid={:?}", uid);
    ws_mgr.disconnect().await;
    release_active_login_lock(&app, uid.as_deref());
    *CURRENT_SESSION.write() = None;

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
        .switch_to_login_with_auto_login(&app, false)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_session() -> Result<Option<SessionInfo>, String> {
    Ok(CURRENT_SESSION.read().clone())
}
