use std::sync::{Mutex, OnceLock};
use tauri::Manager;
use tauri::State;
use tauri::{PhysicalSize, Size};

use crate::config::ConfigManager;
use crate::window::{self, NotificationData, WindowManager};

const SIDEBAR_WIDTH: u32 = 256;
const MIN_WINDOW_WIDTH: u32 = 400;

fn sidebar_open_type() -> &'static Mutex<String> {
    static SIDEBAR_OPEN_TYPE: OnceLock<Mutex<String>> = OnceLock::new();
    SIDEBAR_OPEN_TYPE.get_or_init(|| Mutex::new(String::from("none")))
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
    window::tray::update_unread_count(&app, count, flash.unwrap_or(false))
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
    Ok(())
}

/// 对齐老 im `app:restart-for-network`：网络诊断里「重启应用」确认后整应用重启。
#[tauri::command]
pub async fn restart_app_for_network(app: tauri::AppHandle) -> Result<(), String> {
    app.restart();
    Ok(())
}
