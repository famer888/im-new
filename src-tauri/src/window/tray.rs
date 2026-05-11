use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::{
    image::Image,
    include_image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager,
};
use tracing::{info, warn};

const TRAY_ID: &str = "ocs-main-tray";
const TRAY_ICON: Image<'static> = include_image!("./icons/tray.png");
#[cfg(target_os = "macos")]
const MACOS_TRAY_ICON_HEIGHT: f64 = 20.0;

pub struct TrayUnreadState {
    unread_count: std::sync::atomic::AtomicU32,
    blink_generation: std::sync::atomic::AtomicU64,
}

#[derive(Clone, Serialize)]
struct TrayLogoutPayload {
    quit: bool,
}

#[derive(Debug, Deserialize)]
struct ActiveLoginLock {
    pid: u32,
}

impl TrayUnreadState {
    fn new() -> Self {
        Self {
            unread_count: std::sync::atomic::AtomicU32::new(0),
            blink_generation: std::sync::atomic::AtomicU64::new(0),
        }
    }
}

fn active_login_lock_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("active-logins.json"))
}

fn has_active_login_for_current_process(app: &tauri::AppHandle) -> bool {
    let Some(path) = active_login_lock_path(app) else {
        return false;
    };
    let Some(data) = std::fs::read_to_string(path).ok() else {
        return false;
    };
    let Ok(locks) =
        serde_json::from_str::<std::collections::HashMap<String, ActiveLoginLock>>(&data)
    else {
        return false;
    };
    locks
        .values()
        .any(|active| active.pid == std::process::id())
}

fn show_window(window: tauri::WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

fn show_first_available_window(app: &tauri::AppHandle) {
    for label in ["main", "login"] {
        if let Some(window) = app.get_webview_window(label) {
            if window.is_visible().unwrap_or(false) {
                show_window(window);
                return;
            }
        }
    }

    let labels = if has_active_login_for_current_process(app) {
        ["main", "login"]
    } else {
        ["login", "main"]
    };
    for label in labels {
        if let Some(window) = app.get_webview_window(label) {
            show_window(window);
            return;
        }
    }
}

#[cfg(target_os = "macos")]
fn current_app_bundle() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    exe.ancestors()
        .find(|path| path.extension().and_then(|value| value.to_str()) == Some("app"))
        .map(|path| path.to_path_buf())
}

fn open_new_window() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(app_bundle) = current_app_bundle() {
            Command::new("open")
                .arg("-n")
                .arg(app_bundle)
                .arg("--args")
                .arg("--disable-auto-login")
                .spawn()
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    Command::new(exe)
        .arg("--disable-auto-login")
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn tray_tooltip(count: u32) -> String {
    if count > 0 {
        format!("OCS Chat - {} 条未读消息", count)
    } else {
        "OCS Chat".to_string()
    }
}

#[cfg(target_os = "windows")]
fn reset_tray_icon(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_icon(Some(TRAY_ICON));
    }
}

#[cfg(target_os = "windows")]
fn translucent_tray_icon() -> tauri::image::Image<'static> {
    let mut rgba = TRAY_ICON.rgba().to_vec();
    for pixel in rgba.chunks_exact_mut(4) {
        if pixel[3] > 0 {
            pixel[3] = 24;
        }
    }
    tauri::image::Image::new_owned(rgba, TRAY_ICON.width(), TRAY_ICON.height())
}

#[cfg(target_os = "macos")]
fn resize_macos_tray_icon<R: tauri::Runtime>(tray: &tauri::tray::TrayIcon<R>) {
    let _ = tray.with_inner_tray_icon(|inner| {
        let Some(status_item) = inner.ns_status_item() else {
            return;
        };
        let Some(mtm) = objc2::MainThreadMarker::new() else {
            return;
        };
        let Some(button) = status_item.button(mtm) else {
            return;
        };
        let Some(image) = button.image() else {
            return;
        };

        let mut size = image.size();
        if size.height > 0.0 {
            size.width *= MACOS_TRAY_ICON_HEIGHT / size.height;
            size.height = MACOS_TRAY_ICON_HEIGHT;
            image.setSize(size);
            button.setImage(Some(&image));
        }
    });
}

pub fn update_unread_count(app: &AppHandle, count: u32, flash: bool) -> Result<(), String> {
    let state = app.state::<TrayUnreadState>();
    let previous_count = state
        .unread_count
        .swap(count, std::sync::atomic::Ordering::Relaxed);
    let should_alert = flash && count > 0;
    info!(
        target: "tray-alert",
        count,
        previous_count,
        flash,
        should_alert,
        "update_unread_count"
    );
    let generation = if should_alert {
        Some(
            state
                .blink_generation
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
                + 1,
        )
    } else {
        None
    };
    #[cfg(not(target_os = "windows"))]
    let _ = generation;

    if !flash {
        if let Some(tray) = app.tray_by_id(TRAY_ID) {
            tray.set_tooltip(Some(tray_tooltip(count)))
                .map_err(|e| e.to_string())?;
            if count == 0 {
                #[cfg(target_os = "windows")]
                reset_tray_icon(app);
            }
        }
    }

    if should_alert {
        for label in ["main", "login"] {
            if let Some(window) = app.get_webview_window(label) {
                info!(target: "tray-alert", label, "request_user_attention informational");
                let _ =
                    window.request_user_attention(Some(tauri::UserAttentionType::Informational));
            }
        }
    } else {
        for label in ["main", "login"] {
            if let Some(window) = app.get_webview_window(label) {
                info!(target: "tray-alert", label, "clear_user_attention");
                let _ = window.request_user_attention(None);
            }
        }

        if count > 0 {
            #[cfg(target_os = "windows")]
            reset_tray_icon(app);
        }
    }

    #[cfg(target_os = "windows")]
    if let Some(generation) = generation {
        reset_tray_icon(&app);
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let mut show_normal_icon = true;
            let mut ticks = 0_u8;

            loop {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                let state = app.state::<TrayUnreadState>();
                let current_generation = state
                    .blink_generation
                    .load(std::sync::atomic::Ordering::Relaxed);
                if current_generation != generation {
                    break;
                }

                show_normal_icon = !show_normal_icon;
                if let Some(tray) = app.tray_by_id(TRAY_ID) {
                    if show_normal_icon {
                        let _ = tray.set_icon(Some(TRAY_ICON));
                    } else {
                        let _ = tray.set_icon(Some(translucent_tray_icon()));
                    }
                }

                ticks += 1;
                if ticks >= 8 {
                    reset_tray_icon(&app);
                    break;
                }
            }
        });
    }

    Ok(())
}

pub fn setup_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(TrayUnreadState::new());

    let new_window = MenuItem::with_id(app, "new_window", "打开新窗口", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "打开 ocs", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let logout = MenuItem::with_id(app, "logout", "注销", true, None::<&str>)?;
    let quit_logout = MenuItem::with_id(app, "quit_logout", "退出程序并注销", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&new_window, &open, &settings, &logout, &quit_logout])?;

    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(TRAY_ICON)
        .tooltip("OCS Chat")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "new_window" => {
                if let Err(error) = open_new_window() {
                    warn!("Open new window requested from tray failed: {}", error);
                }
            }
            "open" => {
                show_first_available_window(app);
            }
            "settings" => {
                show_first_available_window(app);
                let _ = app.emit("tray:open-settings", ());
            }
            "logout" => {
                info!("Logout requested from tray");
                show_first_available_window(app);
                let _ = app.emit("tray:logout", TrayLogoutPayload { quit: false });
            }
            "quit_logout" => {
                info!("Quit and logout requested from tray");
                show_first_available_window(app);
                let _ = app.emit("tray:logout", TrayLogoutPayload { quit: true });
            }
            "quit" => {
                info!("Quit requested from tray");
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } => {
                let app = tray.app_handle();
                show_first_available_window(app);
            }
            _ => {}
        })
        .build(app)?;

    #[cfg(target_os = "macos")]
    resize_macos_tray_icon(&tray);

    Ok(())
}
