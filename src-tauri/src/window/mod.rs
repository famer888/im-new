pub mod tray;

use dashmap::DashMap;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowConfig {
    pub label: String,
    pub title: String,
    pub url: String,
    pub width: f64,
    pub height: f64,
    pub resizable: bool,
    pub decorations: bool,
    pub center: bool,
    pub always_on_top: bool,
}

pub struct WindowManager {
    chat_windows: DashMap<String, String>, // conversation_id → window_label
    notification_labels: RwLock<VecDeque<String>>,
    max_notifications: usize,
}

impl WindowManager {
    pub fn new() -> Self {
        Self {
            chat_windows: DashMap::new(),
            notification_labels: RwLock::new(VecDeque::new()),
            max_notifications: 3,
        }
    }

    /// Open an independent chat window for a conversation
    pub fn open_chat_window(
        &self,
        app: &AppHandle,
        conversation_id: &str,
        title: &str,
    ) -> Result<(), WindowError> {
        if let Some(label) = self.chat_windows.get(conversation_id) {
            if let Some(window) = app.get_webview_window(label.value()) {
                window.set_focus().map_err(|e| WindowError::TauriError(e.to_string()))?;
                return Ok(());
            }
        }

        let label = format!("chat_{}", conversation_id.replace(['-', '.'], "_"));
        let url = format!("/chat?id={}", conversation_id);

        let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
            .title(title)
            .inner_size(600.0, 500.0)
            .min_inner_size(400.0, 300.0)
            .center();

        #[cfg(target_os = "macos")]
        {
            builder = builder
                .decorations(true)
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true);
        }

        #[cfg(not(target_os = "macos"))]
        {
            builder = builder.decorations(false);
        }

        let window = builder
            .build()
            .map_err(|e| WindowError::TauriError(e.to_string()))?;

        self.chat_windows
            .insert(conversation_id.to_string(), label.clone());

        let chat_windows = self.chat_windows.clone();
        let conv_id = conversation_id.to_string();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::Destroyed = event {
                chat_windows.remove(&conv_id);
                info!("Chat window closed: {}", conv_id);
            }
        });

        info!("Chat window opened: {} -> {}", conversation_id, label);
        Ok(())
    }

    /// Close a chat window
    pub fn close_chat_window(
        &self,
        app: &AppHandle,
        conversation_id: &str,
    ) -> Result<(), WindowError> {
        if let Some((_, label)) = self.chat_windows.remove(conversation_id) {
            if let Some(window) = app.get_webview_window(&label) {
                window.close().map_err(|e| WindowError::TauriError(e.to_string()))?;
            }
        }
        Ok(())
    }

    /// Switch from login window to main window
    pub fn switch_to_main(&self, app: &AppHandle) -> Result<(), WindowError> {
        if let Some(login) = app.get_webview_window("login") {
            login.hide().map_err(|e| WindowError::TauriError(e.to_string()))?;
        }

        let main_window = match app.get_webview_window("main") {
            Some(w) => {
                w.show().map_err(|e| WindowError::TauriError(e.to_string()))?;
                w
            }
            None => {
                let mut builder = WebviewWindowBuilder::new(
                    app,
                    "main",
                    WebviewUrl::App("/#/home".into()),
                )
                .title("OCS Chat")
                .inner_size(900.0, 600.0)
                .min_inner_size(800.0, 600.0)
                .center();

                #[cfg(target_os = "macos")]
                {
                    builder = builder
                        .decorations(true)
                        .title_bar_style(tauri::TitleBarStyle::Overlay)
                        .hidden_title(true);
                }

                #[cfg(not(target_os = "macos"))]
                {
                    builder = builder.decorations(false);
                }

                builder
                    .build()
                    .map_err(|e| WindowError::TauriError(e.to_string()))?
            }
        };

        let _ = main_window.eval(
            "if (window.location.hash !== '#/home') window.location.hash = '#/home';",
        );
        main_window.set_focus().map_err(|e| WindowError::TauriError(e.to_string()))?;
        info!("Switched to main window");
        Ok(())
    }

    /// Switch from main window back to login
    pub fn switch_to_login(&self, app: &AppHandle) -> Result<(), WindowError> {
        // Close all chat windows
        let conv_ids: Vec<String> = self.chat_windows.iter().map(|r| r.key().clone()).collect();
        for conv_id in conv_ids {
            let _ = self.close_chat_window(app, &conv_id);
        }

        if let Some(main) = app.get_webview_window("main") {
            main.hide().map_err(|e| WindowError::TauriError(e.to_string()))?;
        }

        match app.get_webview_window("login") {
            Some(login) => {
                let _ = login.set_size(tauri::Size::Logical(tauri::LogicalSize::new(300.0, 420.0)));
                login.set_resizable(false).ok();
                let _ = login.center();
                let _ = login.eval(
                    "window.location.hash = '#/login'; window.location.reload();",
                );
                login.show().map_err(|e| WindowError::TauriError(e.to_string()))?;
                login.set_focus().map_err(|e| WindowError::TauriError(e.to_string()))?;
            }
            None => {
                let mut builder = WebviewWindowBuilder::new(
                    app,
                    "login",
                    WebviewUrl::App("/#/login".into()),
                )
                .title("OCS Chat")
                .inner_size(300.0, 420.0)
                .resizable(false)
                .center();

                #[cfg(target_os = "macos")]
                {
                    builder = builder
                        .decorations(true)
                        .title_bar_style(tauri::TitleBarStyle::Overlay)
                        .hidden_title(true);
                }

                #[cfg(not(target_os = "macos"))]
                {
                    builder = builder.decorations(false);
                }

                builder
                    .build()
                    .map_err(|e| WindowError::TauriError(e.to_string()))?;
            }
        }

        info!("Switched to login window");
        Ok(())
    }

    /// Show notification window
    pub fn show_notification(
        &self,
        app: &AppHandle,
        data: NotificationData,
    ) -> Result<(), WindowError> {
        let mut labels = self.notification_labels.write();

        // Close oldest if at max
        while labels.len() >= self.max_notifications {
            if let Some(old_label) = labels.pop_front() {
                if let Some(w) = app.get_webview_window(&old_label) {
                    let _ = w.close();
                }
            }
        }

        let label = format!("notification_{}", chrono::Utc::now().timestamp_millis());
        let index = labels.len();

        let window = WebviewWindowBuilder::new(
            app,
            &label,
            WebviewUrl::App("/notification".into()),
        )
        .title("Notification")
        .inner_size(320.0, 80.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .build()
        .map_err(|e| WindowError::TauriError(e.to_string()))?;

        // Position bottom-right
        if let Ok(monitor) = window.current_monitor() {
            if let Some(monitor) = monitor {
                let size = monitor.size();
                let x = size.width as f64 - 340.0;
                let y = size.height as f64 - 100.0 - (index as f64 * 90.0);
                let _ = window.set_position(tauri::Position::Physical(
                    tauri::PhysicalPosition::new(x as i32, y as i32),
                ));
            }
        }

        let _ = window.emit("notification:data", &data);
        labels.push_back(label);

        // Auto close after 5 seconds
        let app_clone = app.clone();
        let label_clone = labels.back().unwrap().clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            if let Some(w) = app_clone.get_webview_window(&label_clone) {
                let _ = w.close();
            }
        });

        Ok(())
    }

    pub fn has_chat_window(&self, conversation_id: &str) -> bool {
        self.chat_windows.contains_key(conversation_id)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationData {
    pub conversation_id: String,
    pub title: String,
    pub body: String,
    pub avatar: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum WindowError {
    #[error("Tauri error: {0}")]
    TauriError(String),
}

impl serde::Serialize for WindowError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
