use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tauri::Manager;
use tauri::State;
use tauri::{PhysicalSize, Size};

use crate::config::ConfigManager;
use crate::window::{self, NotificationData, WindowManager};

const SIDEBAR_WIDTH: u32 = 256;
const MIN_WINDOW_WIDTH: u32 = 400;

/// 通知回复去重保留时长（毫秒）。多开时同一 requestId 只允许被消费一次。
const NOTIFICATION_REPLY_CLAIM_TTL_MS: i64 = 60_000;

fn sidebar_open_type() -> &'static Mutex<String> {
    static SIDEBAR_OPEN_TYPE: OnceLock<Mutex<String>> = OnceLock::new();
    SIDEBAR_OPEN_TYPE.get_or_init(|| Mutex::new(String::from("none")))
}

fn notification_reply_claims() -> &'static Mutex<HashMap<String, i64>> {
    static CLAIMS: OnceLock<Mutex<HashMap<String, i64>>> = OnceLock::new();
    CLAIMS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 进程级通知回复去重：同一 requestId 首次调用返回 true，其余返回 false。
///
/// 多开时主窗、会话独立窗（chat_*）、隐藏登录窗都会注册 `notification:reply:v3`
/// 监听，各窗口的 JS 去重表相互独立，可能各发一条。这里用进程内共享状态兜底，
/// 保证同一条回复在一个进程里只真正发送一次。
#[tauri::command]
pub async fn claim_notification_reply(request_id: String) -> Result<bool, String> {
    let request_id = request_id.trim().to_string();
    if request_id.is_empty() {
        // 无 requestId 时不做进程级去重，交回前端本地去重处理。
        return Ok(true);
    }

    let now = chrono::Utc::now().timestamp_millis();
    let mut claims = notification_reply_claims()
        .lock()
        .map_err(|e| e.to_string())?;

    claims.retain(|_, created_at| now - *created_at <= NOTIFICATION_REPLY_CLAIM_TTL_MS);

    if claims.contains_key(&request_id) {
        return Ok(false);
    }
    claims.insert(request_id, now);
    Ok(true)
}

#[tauri::command]
pub async fn open_chat_window(
    app: tauri::AppHandle,
    win_mgr: State<'_, WindowManager>,
    conversation_id: String,
    title: String,
) -> Result<(), String> {
    win_mgr
        .open_chat_window(&app, &conversation_id, &title)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_side_bar(
    window: tauri::WebviewWindow,
    visible: bool,
) -> Result<String, String> {
    let is_maximized = window.is_maximized().map_err(|e| e.to_string())?;
    let mut open_type = sidebar_open_type().lock().map_err(|e| e.to_string())?;

    if visible {
        if !is_maximized {
            let size = window.outer_size().map_err(|e| e.to_string())?;
            let monitor_width = window
                .current_monitor()
                .map_err(|e| e.to_string())?
                .map(|m| m.size().width)
                .unwrap_or(size.width + SIDEBAR_WIDTH);
            let next_width = (size.width + SIDEBAR_WIDTH).min(monitor_width);
            window
                .set_size(Size::Physical(PhysicalSize::new(next_width, size.height)))
                .map_err(|e| e.to_string())?;
            *open_type = String::from("outer");
            return Ok(String::from("outer"));
        }
        *open_type = String::from("inner");
        return Ok(String::from("inner"));
    }

    if !is_maximized && open_type.as_str() == "outer" {
        let size = window.outer_size().map_err(|e| e.to_string())?;
        let next_width = size
            .width
            .saturating_sub(SIDEBAR_WIDTH)
            .max(MIN_WINDOW_WIDTH);
        window
            .set_size(Size::Physical(PhysicalSize::new(next_width, size.height)))
            .map_err(|e| e.to_string())?;
    }
    *open_type = String::from("none");
    Ok(String::from("none"))
}

#[tauri::command]
pub async fn close_chat_window(
    app: tauri::AppHandle,
    win_mgr: State<'_, WindowManager>,
    conversation_id: String,
) -> Result<(), String> {
    win_mgr
        .close_chat_window(&app, &conversation_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn show_notification_window(
    app: tauri::AppHandle,
    win_mgr: State<'_, WindowManager>,
    config: State<'_, ConfigManager>,
    data: NotificationData,
) -> Result<(), String> {
    let settings = config.get_settings().map_err(|e| e.to_string())?;
    if !settings.message_reminder_when_minimized {
        return Ok(());
    }

    let should_show = app
        .get_webview_window("main")
        .map(|window| {
            let minimized = window.is_minimized().ok().unwrap_or(false);
            let visible = window.is_visible().ok().unwrap_or(true);
            minimized || !visible
        })
        .unwrap_or(false);
    if !should_show {
        return Ok(());
    }

    win_mgr
        .show_notification(&app, data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_notification_payload(
    label: String,
    win_mgr: State<'_, WindowManager>,
) -> Result<Option<NotificationData>, String> {
    Ok(win_mgr.take_notification_payload(&label))
}

#[tauri::command]
pub async fn close_notification_windows(
    app: tauri::AppHandle,
    win_mgr: State<'_, WindowManager>,
) -> Result<(), String> {
    win_mgr.close_notifications(&app);
    Ok(())
}

#[tauri::command]
pub async fn reveal_notification_window(window: tauri::WebviewWindow) -> Result<(), String> {
    if !window.label().starts_with("notification_") {
        return Ok(());
    }
    window.show().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resize_notification_window(
    window: tauri::WebviewWindow,
    win_mgr: State<'_, WindowManager>,
    height: f64,
    pinned: bool,
) -> Result<(), String> {
    win_mgr
        .resize_notification(&window, height, pinned)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn show_login_window(
    app: tauri::AppHandle,
    win_mgr: State<'_, WindowManager>,
) -> Result<(), String> {
    win_mgr.switch_to_login(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_tray_unread_count(
    app: tauri::AppHandle,
    count: u32,
    flash: Option<bool>,
) -> Result<(), String> {
    let flash = flash.unwrap_or(false);
    // macOS 托盘（NSStatusItem）只能在主线程访问；异步命令跑在 tokio 线程，
    // 直接调用 tray_by_id / set_tooltip 会触发 EXC_BREAKPOINT 闪退，这里切回主线程执行。
    let main_thread_app = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) =
            window::tray::update_unread_count(&main_thread_app, count, flash)
        {
            tracing::warn!("update_tray_unread_count failed on main thread: {}", error);
        }
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_devtools(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        if window.is_devtools_open() {
            window.close_devtools();
        } else {
            window.open_devtools();
        }
        Ok(())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = window;
        Err(String::from(
            "devtools shortcut is only supported on macOS and Windows",
        ))
    }
}

#[tauri::command]
pub async fn open_devtools(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        // 对齐旧 im：头像右键多次触发时只负责“打开”控制台，避免已打开时被误关闭。
        if !window.is_devtools_open() {
            window.open_devtools();
        }
        Ok(())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = window;
        Err(String::from(
            "devtools shortcut is only supported on macOS and Windows",
        ))
    }
}

#[tauri::command]
pub async fn exit_app(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    #[allow(unreachable_code)]
    Ok(())
}

/// 对齐老 im `app:restart-for-network`：网络诊断里「重启应用」确认后整应用重启。
#[tauri::command]
pub async fn restart_app_for_network(app: tauri::AppHandle) -> Result<(), String> {
    app.restart();
    #[allow(unreachable_code)]
    Ok(())
}
