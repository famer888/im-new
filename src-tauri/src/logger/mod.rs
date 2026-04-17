use std::path::Path;
use tracing_appender::rolling;
use tracing_subscriber::fmt::writer::MakeWriterExt;
use tracing_subscriber::{fmt, EnvFilter};

pub fn init(app_data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let log_dir = app_data_dir.join("logs");
    std::fs::create_dir_all(&log_dir)?;

    let file_appender = rolling::daily(&log_dir, "ocs-chat");

    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,ocs_chat=debug"));

    // 同时往文件 + 前台 stderr 写：文件保留全量历史，stderr 让
    // `pnpm tauri:dev` 的终端也能实时看到链路日志。
    let writer = file_appender.and(std::io::stderr);

    fmt()
        .with_writer(writer)
        .with_env_filter(env_filter)
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .init();

    Ok(())
}
