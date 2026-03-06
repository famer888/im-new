use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub version: String,
}

pub fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

pub fn get_platform_code() -> i32 {
    match std::env::consts::OS {
        "macos" => 4,   // Platform.Mac
        "windows" => 3, // Platform.Windows
        "linux" => 6,   // Platform.Linux
        _ => 0,
    }
}

pub fn get_user_data_dir() -> std::path::PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("ocs-chat")
}
