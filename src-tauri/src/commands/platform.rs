use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub version: String,
}

#[tauri::command]
pub fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
pub fn prevent_sleep() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("caffeinate")
            .arg("-d")
            .arg("-i")
            .arg("-s")
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        #[link(name = "kernel32")]
        extern "system" {
            fn SetThreadExecutionState(flags: u32) -> u32;
        }
        const ES_CONTINUOUS: u32 = 0x80000000;
        const ES_SYSTEM_REQUIRED: u32 = 0x00000001;
        const ES_DISPLAY_REQUIRED: u32 = 0x00000002;
        unsafe {
            SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn allow_sleep() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        #[link(name = "kernel32")]
        extern "system" {
            fn SetThreadExecutionState(flags: u32) -> u32;
        }
        const ES_CONTINUOUS: u32 = 0x80000000;
        unsafe {
            SetThreadExecutionState(ES_CONTINUOUS);
        }
    }
    Ok(())
}
