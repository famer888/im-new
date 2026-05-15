use serde::{Deserialize, Serialize};
use tauri::State;

use crate::config::ConfigManager;

fn default_keep_history_on_logout() -> bool {
    true
}

fn default_notification_sound() -> bool {
    false
}

fn default_message_reminder_when_minimized() -> bool {
    true
}

fn default_send_shortcut_key() -> String {
    "Enter".to_string()
}

fn default_friend_verify_required() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub language: String,
    pub notification_enabled: bool,
    #[serde(default = "default_notification_sound")]
    pub notification_sound: bool,
    pub auto_start: bool,
    pub close_to_tray: bool,
    /// 与 im `isMessageReminderWhenMinimized` 一致
    #[serde(default = "default_message_reminder_when_minimized")]
    pub message_reminder_when_minimized: bool,
    pub font_size: i32,
    pub theme: String,
    /// 与 im「账户退出，保留聊天记录」一致：为 true 时退出登录保留本地记录
    #[serde(default = "default_keep_history_on_logout")]
    pub keep_history_on_logout: bool,
    /// 发送快捷键：`Enter` 或 `Ctrl+Enter`
    #[serde(default = "default_send_shortcut_key")]
    pub send_shortcut_key: String,
    /// 与 im「加我为朋友时需要验证」一致
    #[serde(default = "default_friend_verify_required")]
    pub friend_verify_required: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            language: "ch".to_string(),
            notification_enabled: true,
            notification_sound: default_notification_sound(),
            auto_start: false,
            close_to_tray: true,
            message_reminder_when_minimized: default_message_reminder_when_minimized(),
            font_size: 14,
            theme: "light".to_string(),
            keep_history_on_logout: default_keep_history_on_logout(),
            send_shortcut_key: default_send_shortcut_key(),
            friend_verify_required: default_friend_verify_required(),
        }
    }
}

#[tauri::command]
pub async fn get_settings(config: State<'_, ConfigManager>) -> Result<AppSettings, String> {
    config.get_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_settings(
    config: State<'_, ConfigManager>,
    settings: AppSettings,
) -> Result<(), String> {
    config.save_settings(&settings).map_err(|e| e.to_string())
}
