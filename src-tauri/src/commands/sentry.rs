use tracing::error;

#[tauri::command]
pub fn report_error(
    err_type: i32,
    message: String,
    stack: Option<String>,
    tags: Vec<(String, String)>,
) {
    let type_str = match err_type {
        1 => "HTTP",
        2 => "WebSocket",
        3 => "App",
        _ => "Unknown",
    };

    error!(
        error_type = type_str,
        message = %message,
        stack = stack.as_deref().unwrap_or(""),
        tags = ?tags,
        "Error reported from frontend"
    );

    // TODO: integrate with sentry-rust SDK for production
    // sentry::capture_message(&message, sentry::Level::Error);
}
