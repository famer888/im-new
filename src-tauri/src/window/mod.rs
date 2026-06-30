pub mod tray;

use crate::branding;
use dashmap::DashMap;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tracing::info;

const NOTICE_WIDTH: f64 = 278.0;
const NOTICE_HEIGHT: f64 = 64.0;
const NOTICE_SPACING: f64 = 10.0;
const NOTICE_MARGIN_RIGHT: f64 = 10.0;
const NOTICE_MARGIN_BOTTOM: f64 = 10.0;

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
    notification_pinned: Arc<DashMap<String, bool>>,
    pending_notifications: DashMap<String, NotificationData>,
    max_notifications: usize,
}

impl WindowManager {
    pub fn new() -> Self {
        Self {
            chat_windows: DashMap::new(),
            notification_labels: RwLock::new(VecDeque::new()),
            notification_pinned: Arc::new(DashMap::new()),
            pending_notifications: DashMap::new(),
            max_notifications: 1,
        }
    }

    fn position_notification_window(window: &WebviewWindow, index: usize, logical_height: f64) {
        if let Ok(Some(monitor)) = window
            .current_monitor()
            .or_else(|_| window.primary_monitor())
        {
            let work_area = monitor.work_area();
            let scale_factor = monitor.scale_factor();
            let notice_width = (NOTICE_WIDTH * scale_factor).round() as i32;
            let notice_height = (logical_height * scale_factor).round() as i32;
            let notice_spacing = (NOTICE_SPACING * scale_factor).round() as i32;
            let margin_right = (NOTICE_MARGIN_RIGHT * scale_factor).round() as i32;
            let margin_bottom = (NOTICE_MARGIN_BOTTOM * scale_factor).round() as i32;
            let x =
                work_area.position.x + work_area.size.width as i32 - notice_width - margin_right;
            let y = work_area.position.y + work_area.size.height as i32
                - notice_height
                - margin_bottom
                - (index as i32 * (notice_height + notice_spacing));
            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
                x, y,
            )));
        }
    }

    /// Open an independent chat window for a conversation
    pub fn open_chat_window(
        &self,
        app: &AppHandle,
        conversation_id: &str,
        title: &str,
    ) -> Result<(), WindowError> {
        // Keep subwindow titles branded so multi-brand installs are easy to distinguish.
        let window_title = branding::chat_window_title(app, title);
        if let Some(label) = self.chat_windows.get(conversation_id) {
            if let Some(window) = app.get_webview_window(label.value()) {
                let _ = window.set_title(&window_title);
                window
                    .set_focus()
                    .map_err(|e| WindowError::TauriError(e.to_string()))?;
                return Ok(());
            }
        }

        let label = format!("chat_{}", conversation_id.replace(['-', '.'], "_"));
        let url = format!("/chat?id={}", conversation_id);

        let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
            .title(&window_title)
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
                window
                    .close()
                    .map_err(|e| WindowError::TauriError(e.to_string()))?;
            }
        }
        Ok(())
    }

    /// Switch from login window to main window
    pub fn switch_to_main(&self, app: &AppHandle) -> Result<(), WindowError> {
        let login_was_visible = if let Some(login) = app.get_webview_window("login") {
            let visible = login.is_visible().unwrap_or(false);
            login
                .hide()
                .map_err(|e| WindowError::TauriError(e.to_string()))?;
            visible
        } else {
            false
        };

        let (main_window, reused_main_window) = match app.get_webview_window("main") {
            Some(w) => {
                w.show()
                    .map_err(|e| WindowError::TauriError(e.to_string()))?;
                (w, true)
            }
            None => {
                let app_display_name = branding::app_display_name(app);
                let mut builder =
                    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("/#/home".into()))
                        .title(&app_display_name)
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

                let window = builder
                    .build()
                    .map_err(|e| WindowError::TauriError(e.to_string()))?;
                hide_to_tray_on_close(&window);
                (window, false)
            }
        };

        if reused_main_window && login_was_visible {
            let _ = main_window.eval("window.location.hash = '#/home'; window.location.reload();");
        } else {
            let _ = main_window
                .eval("if (window.location.hash !== '#/home') window.location.hash = '#/home';");
        }
        main_window
            .set_focus()
            .map_err(|e| WindowError::TauriError(e.to_string()))?;
        info!("Switched to main window");
        Ok(())
    }

    /// Switch from main window back to login
    pub fn switch_to_login(&self, app: &AppHandle) -> Result<(), WindowError> {
        self.switch_to_login_with_auto_login(app, true)
    }

    /// Switch from main window back to login, optionally disabling cached auto-login.
    pub fn switch_to_login_with_auto_login(
        &self,
        app: &AppHandle,
        auto_login: bool,
    ) -> Result<(), WindowError> {
        // Close all chat windows
        let conv_ids: Vec<String> = self.chat_windows.iter().map(|r| r.key().clone()).collect();
        for conv_id in conv_ids {
            let _ = self.close_chat_window(app, &conv_id);
        }

        if let Some(main) = app.get_webview_window("main") {
            main.hide()
                .map_err(|e| WindowError::TauriError(e.to_string()))?;
        }

        match app.get_webview_window("login") {
            Some(login) => {
                let _ = login.set_size(tauri::Size::Logical(tauri::LogicalSize::new(300.0, 420.0)));
                login.set_resizable(false).ok();
                let _ = login.center();
                let login_hash = if auto_login {
                    "#/login"
                } else {
                    "#/login?autoLogin=0"
                };
                let _ = login.eval(&format!(
                    "window.location.hash = '{}'; window.location.reload();",
                    login_hash
                ));
                login
                    .show()
                    .map_err(|e| WindowError::TauriError(e.to_string()))?;
                login
                    .set_focus()
                    .map_err(|e| WindowError::TauriError(e.to_string()))?;
            }
            None => {
                let app_display_name = branding::app_display_name(app);
                let login_url = if auto_login {
                    "/#/login"
                } else {
                    "/#/login?autoLogin=0"
                };
                let mut builder =
                    WebviewWindowBuilder::new(app, "login", WebviewUrl::App(login_url.into()))
                        .title(&app_display_name)
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
                    .map(|window| {
                        hide_to_tray_on_close(&window);
                        window
                    })
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

        // Keep the active reply window stable; new reminders should not interrupt typing.
        if labels.iter().any(|label| {
            self.notification_pinned
                .get(label)
                .map(|value| *value.value())
                .unwrap_or(false)
                && app.get_webview_window(label).is_some()
        }) {
            return Ok(());
        }

        // Close existing reminder so the bottom-right area only shows the latest one.
        while labels.len() >= self.max_notifications {
            if let Some(old_label) = labels.pop_front() {
                self.notification_pinned.remove(&old_label);
                self.pending_notifications.remove(&old_label);
                if let Some(w) = app.get_webview_window(&old_label) {
                    let _ = w.close();
                }
            }
        }

        let label = format!("notification_{}", chrono::Utc::now().timestamp_millis());
        let index = labels.len();
        self.pending_notifications
            .insert(label.clone(), data.clone());
        let notification_url = format!("/#/notification?label={}", label);

        let builder =
            WebviewWindowBuilder::new(app, &label, WebviewUrl::App(notification_url.into()))
                .title("Notification")
                .inner_size(NOTICE_WIDTH, NOTICE_HEIGHT)
                .resizable(false)
                .decorations(false)
                .transparent(true)
                .always_on_top(true);

        #[cfg(target_os = "windows")]
        let builder = {
            // Windows WebView2 can expose its default white surface before Vue paints;
            // keep the reminder hidden until the page has rendered its first frame.
            builder.skip_taskbar(true).visible(false).shadow(false)
        };

        let window = builder
            .build()
            .map_err(|e| WindowError::TauriError(e.to_string()))?;

        // Keep the reminder above the Dock/taskbar by using the monitor work area.
        Self::position_notification_window(&window, index, NOTICE_HEIGHT);

        #[cfg(target_os = "windows")]
        {
            let app_for_cleanup = app.clone();
            let label_for_cleanup = label.clone();
            tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(8)).await;
                // 前端未在时限内 reveal 时关闭空窗，避免隐藏通知窗长期占用或误显示空白 WebView。
                if let Some(w) = app_for_cleanup.get_webview_window(&label_for_cleanup) {
                    if !w.is_visible().ok().unwrap_or(true) {
                        let _ = w.close();
                    }
                }
            });
        }

        labels.push_back(label);

        // Auto close after 5 seconds
        let app_clone = app.clone();
        let pinned = self.notification_pinned.clone();
        let label_clone = labels.back().unwrap().clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            if pinned
                .get(&label_clone)
                .map(|value| *value.value())
                .unwrap_or(false)
            {
                return;
            }
            if let Some(w) = app_clone.get_webview_window(&label_clone) {
                let _ = w.close();
            }
        });

        Ok(())
    }

    pub fn resize_notification(
        &self,
        window: &WebviewWindow,
        height: f64,
        pinned: bool,
    ) -> Result<(), WindowError> {
        let label = window.label().to_string();
        if !label.starts_with("notification_") {
            return Err(WindowError::TauriError(
                "not a notification window".to_string(),
            ));
        }

        if pinned {
            self.notification_pinned.insert(label.clone(), true);
            let other_labels = {
                let mut labels = self.notification_labels.write();
                let other_labels = labels
                    .iter()
                    .filter(|item| *item != &label)
                    .cloned()
                    .collect::<Vec<_>>();
                labels.retain(|item| item == &label);
                other_labels
            };
            for other_label in other_labels {
                self.notification_pinned.remove(&other_label);
                self.pending_notifications.remove(&other_label);
                if let Some(other_window) = window.app_handle().get_webview_window(&other_label) {
                    let _ = other_window.close();
                }
            }
        } else {
            self.notification_pinned.remove(&label);
        }

        window
            .set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                NOTICE_WIDTH,
                height,
            )))
            .map_err(|e| WindowError::TauriError(e.to_string()))?;

        let labels = self.notification_labels.read();
        let index = labels.iter().position(|item| item == &label).unwrap_or(0);
        Self::position_notification_window(window, index, height);
        Ok(())
    }

    pub fn close_notifications(&self, app: &AppHandle) {
        // Dock 点击要回到主窗口；先关闭右下角提醒，避免 always-on-top 通知窗继续占住前台。
        let labels = {
            let mut labels = self.notification_labels.write();
            labels.drain(..).collect::<Vec<_>>()
        };
        for label in labels {
            self.notification_pinned.remove(&label);
            self.pending_notifications.remove(&label);
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.close();
            }
        }
    }

    pub fn take_notification_payload(&self, label: &str) -> Option<NotificationData> {
        if !label.starts_with("notification_") {
            return None;
        }
        self.pending_notifications
            .remove(label)
            .map(|(_, data)| data)
    }

    pub fn has_chat_window(&self, conversation_id: &str) -> bool {
        self.chat_windows.contains_key(conversation_id)
    }
}

pub fn hide_to_tray_on_close(window: &WebviewWindow) {
    let window_to_hide = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_to_hide.minimize();
            let _ = window_to_hide.hide();
        }
    });
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationData {
    pub conversation_id: String,
    pub title: String,
    pub body: String,
    pub avatar: Option<String>,
    pub conversation_type: Option<String>,
    pub sender_name: Option<String>,
    pub unread_count: Option<u32>,
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
