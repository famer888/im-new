use serde::Serialize;
use tauri::Emitter;

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
pub async fn start_screenshot(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let file_path = std::env::temp_dir().join(format!(
            "ocs_screenshot_{}.png",
            uuid::Uuid::new_v4()
        ));
        let file_path_text = file_path.to_string_lossy().to_string();
        let app_clone = app.clone();

        tokio::task::spawn_blocking(move || {
            match std::process::Command::new("screencapture")
                .arg("-i")
                .arg(&file_path)
                .status()
            {
                Ok(status) if status.success() && file_path.exists() => {
                    let _ = app_clone.emit(
                        "screenshots-ok",
                        serde_json::json!({ "filePath": file_path_text }),
                    );
                }
                Ok(_) => {}
                Err(e) => {
                    let _ = app_clone.emit(
                        "screenshots-error",
                        serde_json::json!({ "error": e.to_string() }),
                    );
                }
            }
        });

        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg("ms-screenclip:")
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app;
        Err("screenshot is not supported on this platform".to_string())
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
