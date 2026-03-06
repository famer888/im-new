use serde::{Deserialize, Serialize};
use tauri::State;

use crate::config::ConfigManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub language: String,
    pub notification_enabled: bool,
    pub notification_sound: bool,
    pub auto_start: bool,
    pub close_to_tray: bool,
    pub font_size: i32,
    pub theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            language: "ch".to_string(),
            notification_enabled: true,
            notification_sound: true,
            auto_start: false,
            close_to_tray: true,
            font_size: 14,
            theme: "light".to_string(),
        }
    }
}

#[tauri::command]
pub async fn get_settings(
    config: State<'_, ConfigManager>,
) -> Result<AppSettings, String> {
    config.get_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_settings(
    config: State<'_, ConfigManager>,
    settings: AppSettings,
) -> Result<(), String> {
    config.save_settings(&settings).map_err(|e| e.to_string())
}
