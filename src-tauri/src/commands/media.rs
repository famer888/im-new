use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewUrl,
    WebviewWindowBuilder,
};

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
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(
        &app,
        label,
        WebviewUrl::App("/#/media".into()),
    )
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
    let _ = window.show();
    let _ = window.set_focus();

    Ok(())
}

#[tauri::command]
pub async fn media_window_minimize(window: tauri::WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn media_window_toggle_maximize(
    window: tauri::WebviewWindow,
) -> Result<bool, String> {
    let is_maximized = window.is_maximized().map_err(|e| e.to_string())?;
    if is_maximized {
        window.unmaximize().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        window.maximize().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
pub async fn media_window_close(window: tauri::WebviewWindow) -> Result<(), String> {
    window.destroy().map_err(|e| e.to_string())
}
