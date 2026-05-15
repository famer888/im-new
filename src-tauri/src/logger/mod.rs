use std::path::Path;
use tracing_appender::rolling;
use tracing_subscriber::{fmt, EnvFilter};

pub fn init(app_data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let log_dir = app_data_dir.join("logs");
    std::fs::create_dir_all(&log_dir)?;

    let file_appender = rolling::daily(&log_dir, "ocs-chat");

    let env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,ocs_chat=debug"));

    fmt()
        .with_writer(file_appender)
        .with_env_filter(env_filter)
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .init();

    Ok(())
}
