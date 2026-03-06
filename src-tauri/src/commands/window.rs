use tauri::State;

use crate::window::WindowManager;

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
pub async fn close_chat_window(
    app: tauri::AppHandle,
    win_mgr: State<'_, WindowManager>,
    conversation_id: String,
) -> Result<(), String> {
    win_mgr
        .close_chat_window(&app, &conversation_id)
        .map_err(|e| e.to_string())
}
