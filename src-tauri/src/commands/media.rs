use std::sync::{Mutex, OnceLock};
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewUrl,
    WebviewWindowBuilder,
};

#[derive(Clone, Copy)]
struct MediaWindowBounds {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
}

fn media_window_restore_bounds() -> &'static Mutex<Option<MediaWindowBounds>> {
    static MEDIA_WINDOW_RESTORE_BOUNDS: OnceLock<Mutex<Option<MediaWindowBounds>>> =
        OnceLock::new();
    MEDIA_WINDOW_RESTORE_BOUNDS.get_or_init(|| Mutex::new(None))
}

#[tauri::command]
pub async fn open_media_window(
    app: AppHandle,
    title: Option<String>,
    x: Option<i32>,
    y: Option<i32>,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<(), String> {
    let label = "media_viewer";
    let next_title = title.unwrap_or_else(|| "图片".to_string());
    let next_width = width.unwrap_or(960).max(1);
    let next_height = height.unwrap_or(640).max(1);

    if let Some(window) = app.get_webview_window(label) {
        let _ = window.set_title(&next_title);
        let _ = window.set_size(Size::Physical(PhysicalSize::new(next_width, next_height)));
        if let (Some(next_x), Some(next_y)) = (x, y) {
            let _ = window.set_position(Position::Physical(PhysicalPosition::new(next_x, next_y)));
        }
        if let Ok(mut restore_bounds) = media_window_restore_bounds().lock() {
            *restore_bounds = None;
        }
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let builder = WebviewWindowBuilder::new(&app, label, WebviewUrl::App("/#/media".into()))
        .title(&next_title)
        .resizable(true)
        .decorations(false)
        .visible(false);

    let window = builder.build().map_err(|e| e.to_string())?;
    let _ = window.set_size(Size::Physical(PhysicalSize::new(next_width, next_height)));
    if let (Some(next_x), Some(next_y)) = (x, y) {
        let _ = window.set_position(Position::Physical(PhysicalPosition::new(next_x, next_y)));
    } else {
        let _ = window.center();
    }
    if let Ok(mut restore_bounds) = media_window_restore_bounds().lock() {
        *restore_bounds = None;
    }
    let _ = window.show();
    let _ = window.set_focus();

    Ok(())
}

#[tauri::command]
pub async fn media_window_minimize(window: tauri::WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn media_window_toggle_maximize(window: tauri::WebviewWindow) -> Result<bool, String> {
    let mut restore_bounds = media_window_restore_bounds()
        .lock()
        .map_err(|e| e.to_string())?;

    if let Some(bounds) = restore_bounds.take() {
        window
            .set_position(Position::Physical(bounds.position))
            .map_err(|e| e.to_string())?;
        window
            .set_size(Size::Physical(bounds.size))
            .map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        let current_position = window.outer_position().map_err(|e| e.to_string())?;
        let current_size = window.outer_size().map_err(|e| e.to_string())?;
        let monitor = window
            .current_monitor()
            .map_err(|e| e.to_string())?
            .or_else(|| window.primary_monitor().ok().flatten())
            .ok_or_else(|| "no monitor found".to_string())?;
        let work_area = monitor.work_area();

        *restore_bounds = Some(MediaWindowBounds {
            position: current_position,
            size: current_size,
        });

        window
            .set_position(Position::Physical(work_area.position))
            .map_err(|e| e.to_string())?;
        window
            .set_size(Size::Physical(work_area.size))
            .map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
pub async fn media_window_toggle_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
    let next_fullscreen = !window.is_fullscreen().map_err(|e| e.to_string())?;
    window
        .set_fullscreen(next_fullscreen)
        .map_err(|e| e.to_string())?;
    Ok(next_fullscreen)
}

#[tauri::command]
pub async fn media_window_close(window: tauri::WebviewWindow) -> Result<(), String> {
    if let Ok(mut restore_bounds) = media_window_restore_bounds().lock() {
        *restore_bounds = None;
    }
    window.destroy().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn media_window_is_maximized() -> Result<bool, String> {
    let restore_bounds = media_window_restore_bounds()
        .lock()
        .map_err(|e| e.to_string())?;
    Ok(restore_bounds.is_some())
}

#[tauri::command]
pub async fn media_window_is_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
    window.is_fullscreen().map_err(|e| e.to_string())
}
