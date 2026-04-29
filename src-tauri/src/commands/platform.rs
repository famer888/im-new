use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use tauri::Emitter;

#[derive(Debug, Serialize)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardFilePayload {
    pub name: String,
    pub mime: String,
    pub data_base64: String,
}

#[tauri::command]
pub fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn NSBeep();
}

#[tauri::command]
pub fn system_beep() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    unsafe {
        NSBeep();
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-Command", "[console]::Beep(800,180)"])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        use std::io::Write as _;
        print!("\x07");
        std::io::stdout().flush().map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
pub fn read_clipboard_text() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("pbpaste")
            .output()
            .map_err(|e| e.to_string())?;
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-Command", "Get-Clipboard -Raw"])
            .output()
            .map_err(|e| e.to_string())?;
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(String::new())
    }
}

#[tauri::command]
pub fn write_clipboard_image(data_base64: String) -> Result<(), String> {
    let bytes = general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        return write_clipboard_image_macos(&bytes);
    }

    #[cfg(target_os = "windows")]
    {
        return write_clipboard_image_windows(&bytes);
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = bytes;
        Err("clipboard image write is not supported on this platform".to_string())
    }
}

#[tauri::command]
pub fn read_clipboard_files() -> Result<Vec<ClipboardFilePayload>, String> {
    let paths = read_clipboard_file_paths()?;
    read_files_from_paths(paths)
}

#[tauri::command]
pub fn read_local_files(paths: Vec<String>) -> Result<Vec<ClipboardFilePayload>, String> {
    read_files_from_paths(paths.into_iter().map(std::path::PathBuf::from).collect())
}

fn read_files_from_paths(paths: Vec<std::path::PathBuf>) -> Result<Vec<ClipboardFilePayload>, String> {
    let mut files = Vec::new();

    for path in paths {
        if !path.is_file() {
            continue;
        }
        let data = std::fs::read(&path).map_err(|e| e.to_string())?;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "clipboard-file".to_string());
        let mime = mime_from_path(&path);
        files.push(ClipboardFilePayload {
            name,
            mime,
            data_base64: general_purpose::STANDARD.encode(data),
        });
    }

    Ok(files)
}

fn read_clipboard_file_paths() -> Result<Vec<std::path::PathBuf>, String> {
    #[cfg(target_os = "macos")]
    {
        read_macos_clipboard_file_paths()
    }

    #[cfg(target_os = "windows")]
    {
        read_windows_clipboard_file_paths()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(Vec::new())
    }
}

#[cfg(target_os = "macos")]
fn read_macos_clipboard_file_paths() -> Result<Vec<std::path::PathBuf>, String> {
    let mut paths = Vec::new();

    let file_script = r#"
try
  set theFile to the clipboard as «class furl»
  return POSIX path of theFile
on error
  return ""
end try
"#;
    let file_output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(file_script)
        .output()
        .map_err(|e| e.to_string())?;
    let file_text = String::from_utf8_lossy(&file_output.stdout).trim().to_string();
    if !file_text.is_empty() {
        paths.push(std::path::PathBuf::from(file_text));
    }

    let png_path = std::env::temp_dir().join(format!(
        "ocs_clipboard_{}.png",
        uuid::Uuid::new_v4()
    ));
    let png_path_text = png_path.to_string_lossy().to_string();
    let image_script = format!(
        r#"
set outPath to "{}"
try
  set imageData to the clipboard as «class PNGf»
on error
  return ""
end try
set outFile to open for access POSIX file outPath with write permission
set eof outFile to 0
write imageData to outFile
close access outFile
return outPath
"#,
        png_path_text.replace('"', "\\\"")
    );
    let image_output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(image_script)
        .output()
        .map_err(|e| e.to_string())?;
    let image_text = String::from_utf8_lossy(&image_output.stdout).trim().to_string();
    if !image_text.is_empty() {
        paths.push(std::path::PathBuf::from(image_text));
        return Ok(paths);
    }

    let tiff_path = std::env::temp_dir().join(format!(
        "ocs_clipboard_{}.tiff",
        uuid::Uuid::new_v4()
    ));
    let tiff_path_text = tiff_path.to_string_lossy().to_string();
    let tiff_script = format!(
        r#"
set outPath to "{}"
try
  set imageData to the clipboard as «class TIFF»
on error
  return ""
end try
set outFile to open for access POSIX file outPath with write permission
set eof outFile to 0
write imageData to outFile
close access outFile
return outPath
"#,
        tiff_path_text.replace('"', "\\\"")
    );
    let tiff_output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(tiff_script)
        .output()
        .map_err(|e| e.to_string())?;
    let tiff_text = String::from_utf8_lossy(&tiff_output.stdout).trim().to_string();
    if !tiff_text.is_empty() {
        let converted_path = std::env::temp_dir().join(format!(
            "ocs_clipboard_{}.png",
            uuid::Uuid::new_v4()
        ));
        let _ = std::process::Command::new("sips")
            .args([
                "-s",
                "format",
                "png",
                &tiff_text,
                "--out",
                &converted_path.to_string_lossy(),
            ])
            .output();
        if converted_path.exists() {
            paths.push(converted_path);
        } else {
            paths.push(std::path::PathBuf::from(tiff_text));
        }
    }

    Ok(paths)
}

#[cfg(target_os = "windows")]
fn read_windows_clipboard_file_paths() -> Result<Vec<std::path::PathBuf>, String> {
    let script = r#"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
if ([System.Windows.Forms.Clipboard]::ContainsFileDropList()) {
  foreach ($item in [System.Windows.Forms.Clipboard]::GetFileDropList()) {
    Write-Output $item
  }
  exit
}
if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
  $path = Join-Path $env:TEMP ("ocs_clipboard_" + [guid]::NewGuid().ToString() + ".png")
  $image = [System.Windows.Forms.Clipboard]::GetImage()
  $image.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output $path
}
"#;
    let output = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&output.stdout);
    Ok(text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(std::path::PathBuf::from)
        .collect())
}

fn mime_from_path(path: &std::path::Path) -> String {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "tif" | "tiff" => "image/tiff",
        "heic" => "image/heic",
        "heif" => "image/heif",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
    .to_string()
}

#[cfg(target_os = "macos")]
fn write_clipboard_image_macos(bytes: &[u8]) -> Result<(), String> {
    let path = std::env::temp_dir().join(format!(
        "ocs_clipboard_write_{}.png",
        uuid::Uuid::new_v4()
    ));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;

    let path_text = path.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        r#"
set imageFile to POSIX file "{}"
set the clipboard to (read imageFile as «class PNGf»)
"#,
        path_text
    );

    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| e.to_string())?;

    let _ = std::fs::remove_file(&path);

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(target_os = "windows")]
fn write_clipboard_image_windows(bytes: &[u8]) -> Result<(), String> {
    let path = std::env::temp_dir().join(format!(
        "ocs_clipboard_write_{}.png",
        uuid::Uuid::new_v4()
    ));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;

    let path_text = path.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        r#"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$path = "{}"
$image = [System.Drawing.Image]::FromFile($path)
try {{
  [System.Windows.Forms.Clipboard]::SetImage($image)
}} finally {{
  $image.Dispose()
}}
"#,
        path_text
    );

    let output = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-Sta", "-Command", &script])
        .output()
        .map_err(|e| e.to_string())?;

    let _ = std::fs::remove_file(&path);

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
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
