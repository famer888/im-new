use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Manager,
};
use tracing::info;

const TRAY_ID: &str = "ocs-main-tray";

pub struct TrayUnreadState {
    unread_count: std::sync::atomic::AtomicU32,
}

impl TrayUnreadState {
    fn new() -> Self {
        Self {
            unread_count: std::sync::atomic::AtomicU32::new(0),
        }
    }
}

fn show_first_available_window(app: &tauri::AppHandle) {
    for label in ["main", "login"] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
            return;
        }
    }
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
        if let Some(icon) = app.default_window_icon() {
            let _ = tray.set_icon(Some(icon.clone()));
        }
    }
}

pub fn update_unread_count(app: &AppHandle, count: u32) -> Result<(), String> {
    let state = app.state::<TrayUnreadState>();
    state
        .unread_count
        .store(count, std::sync::atomic::Ordering::Relaxed);

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_tooltip(Some(tray_tooltip(count)))
            .map_err(|e| e.to_string())?;
        if count == 0 {
            #[cfg(target_os = "windows")]
            reset_tray_icon(app);
        }
    }

    for label in ["main", "login"] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = if count > 0 {
                window.request_user_attention(Some(tauri::UserAttentionType::Critical))
            } else {
                window.request_user_attention(None)
            };
        }
    }

    #[cfg(target_os = "windows")]
    if count > 0 {
        reset_tray_icon(&app);
    }

    Ok(())
}

pub fn setup_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(TrayUnreadState::new());

    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("OCS Chat")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                show_first_available_window(app);
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

    Ok(())
}
