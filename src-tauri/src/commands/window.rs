use tauri::State;
use tauri::{PhysicalSize, Size};
use std::sync::{Mutex, OnceLock};

use crate::window::{NotificationData, WindowManager};

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
        let next_width = size.width.saturating_sub(SIDEBAR_WIDTH).max(MIN_WINDOW_WIDTH);
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
    data: NotificationData,
) -> Result<(), String> {
    win_mgr
        .show_notification(&app, data)
        .map_err(|e| e.to_string())
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
    win_mgr
        .switch_to_login(&app)
        .map_err(|e| e.to_string())
}
