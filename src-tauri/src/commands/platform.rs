use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use tauri::Emitter;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
fn hidden_windows_command(program: &str) -> std::process::Command {
    let mut command = std::process::Command::new(program);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[derive(Debug, Serialize)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProxySnapshot {
    pub ok: bool,
    pub source: String,
    pub enabled: bool,
    pub value: String,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInterfaceSummary {
    pub name: String,
    pub addresses: Vec<String>,
    pub vpn_like: bool,
    pub reasons: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VpnSuspicion {
    pub suspected: bool,
    pub score: u32,
    pub reasons: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkEnvSnapshot {
    pub os: String,
    pub proxy: NetworkProxySnapshot,
    pub interfaces: Vec<NetworkInterfaceSummary>,
    pub vpn_suspicion: VpnSuspicion,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardFilePayload {
    pub name: String,
    pub mime: String,
    pub data_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileMeta {
    pub path: String,
    pub name: String,
    pub mime: String,
    pub size: u64,
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
pub fn get_network_snapshot() -> NetworkEnvSnapshot {
    let proxy = collect_proxy_snapshot();
    let interfaces = collect_network_interfaces();
    let vpn_suspicion = judge_vpn_suspicion(&proxy, &interfaces);

    // 对齐老 im 的 network-env:snapshot：Tauri 没有 Electron resolveProxy/netLog，
    // 这里采集系统代理、网卡和 VPN 线索，供“网络诊断”弹窗排查。
    NetworkEnvSnapshot {
        os: std::env::consts::OS.to_string(),
        proxy,
        interfaces,
        vpn_suspicion,
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
        let _ = hidden_windows_command("powershell.exe")
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
        let output = hidden_windows_command("powershell.exe")
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
pub fn write_clipboard_text(text: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::io::Write as _;

        let mut child = std::process::Command::new("pbcopy")
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;

        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "failed to open pbcopy stdin".to_string())?;
        stdin
            .write_all(text.as_bytes())
            .map_err(|e| e.to_string())?;
        drop(stdin);

        let status = child.wait().map_err(|e| e.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("pbcopy failed with status: {}", status));
    }

    #[cfg(target_os = "windows")]
    {
        use std::io::Write as _;

        let mut child = hidden_windows_command("powershell.exe")
            .args([
                "-NoProfile",
                "-Command",
                "Set-Clipboard -Value ([Console]::In.ReadToEnd())",
            ])
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;

        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "failed to open Set-Clipboard stdin".to_string())?;
        stdin
            .write_all(text.as_bytes())
            .map_err(|e| e.to_string())?;
        drop(stdin);

        let status = child.wait().map_err(|e| e.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("Set-Clipboard failed with status: {}", status));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = text;
        Err("clipboard text write is not supported on this platform".to_string())
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

fn run_command_output(program: &str, args: &[&str]) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let mut command = hidden_windows_command(program);

    #[cfg(not(target_os = "windows"))]
    let mut command = std::process::Command::new(program);

    let output = command.args(args).output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("{} exited with {}", program, output.status)
        } else {
            stderr
        })
    }
}

fn collect_proxy_snapshot() -> NetworkProxySnapshot {
    #[cfg(target_os = "macos")]
    {
        match run_command_output("scutil", &["--proxy"]) {
            Ok(output) => {
                let enabled = output.lines().any(|line| {
                    let text = line.trim();
                    (text.starts_with("HTTPEnable")
                        || text.starts_with("HTTPSEnable")
                        || text.starts_with("SOCKSEnable")
                        || text.starts_with("ProxyAutoConfigEnable")
                        || text.starts_with("ProxyAutoDiscoveryEnable"))
                        && text.ends_with(": 1")
                });
                let value = output
                    .lines()
                    .map(str::trim)
                    .filter(|line| {
                        line.contains("Proxy")
                            || line.contains("Port")
                            || line.contains("Enable")
                            || line.contains("URL")
                    })
                    .collect::<Vec<_>>()
                    .join("; ");
                return NetworkProxySnapshot {
                    ok: true,
                    source: "scutil --proxy".to_string(),
                    enabled,
                    value,
                    error: None,
                };
            }
            Err(error) => {
                return NetworkProxySnapshot {
                    ok: false,
                    source: "scutil --proxy".to_string(),
                    enabled: false,
                    value: String::new(),
                    error: Some(error),
                };
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        match run_command_output("netsh.exe", &["winhttp", "show", "proxy"]) {
            Ok(output) => {
                let normalized = output.trim().replace('\r', " ");
                let enabled = !normalized.to_ascii_lowercase().contains("direct access");
                return NetworkProxySnapshot {
                    ok: true,
                    source: "netsh winhttp show proxy".to_string(),
                    enabled,
                    value: normalized,
                    error: None,
                };
            }
            Err(error) => {
                return NetworkProxySnapshot {
                    ok: false,
                    source: "netsh winhttp show proxy".to_string(),
                    enabled: false,
                    value: String::new(),
                    error: Some(error),
                };
            }
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let keys = ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "NO_PROXY"];
        let value = keys
            .iter()
            .filter_map(|key| {
                std::env::var(key)
                    .ok()
                    .map(|val| format!("{}={}", key, val))
            })
            .collect::<Vec<_>>()
            .join("; ");
        NetworkProxySnapshot {
            ok: true,
            source: "proxy environment variables".to_string(),
            enabled: !value.is_empty(),
            value,
            error: None,
        }
    }
}

fn collect_network_interfaces() -> Vec<NetworkInterfaceSummary> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    let raw = run_command_output("ifconfig", &[]).or_else(|_| run_command_output("ip", &["addr"]));

    #[cfg(target_os = "windows")]
    let raw = run_command_output("ipconfig.exe", &["/all"]);

    match raw {
        Ok(output) => parse_network_interfaces(&output),
        Err(_) => Vec::new(),
    }
}

fn parse_network_interfaces(output: &str) -> Vec<NetworkInterfaceSummary> {
    #[cfg(target_os = "windows")]
    {
        return parse_windows_interfaces(output);
    }

    #[cfg(not(target_os = "windows"))]
    {
        return parse_unix_interfaces(output);
    }
}

#[cfg(not(target_os = "windows"))]
fn parse_unix_interfaces(output: &str) -> Vec<NetworkInterfaceSummary> {
    let mut items: Vec<NetworkInterfaceSummary> = Vec::new();
    let mut current_name = String::new();
    let mut current_addresses: Vec<String> = Vec::new();

    for line in output.lines() {
        if !line.starts_with(char::is_whitespace) && line.contains(':') {
            push_interface(&mut items, &current_name, &current_addresses);
            current_name = line
                .split(':')
                .next()
                .unwrap_or_default()
                .trim()
                .trim_matches(|c| c == '<' || c == '>')
                .to_string();
            current_addresses.clear();
        }

        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("inet ") {
            if let Some(addr) = rest.split_whitespace().next() {
                if !addr.starts_with("127.") {
                    current_addresses.push(addr.to_string());
                }
            }
        }
    }
    push_interface(&mut items, &current_name, &current_addresses);
    items
}

#[cfg(target_os = "windows")]
fn parse_windows_interfaces(output: &str) -> Vec<NetworkInterfaceSummary> {
    let mut items: Vec<NetworkInterfaceSummary> = Vec::new();
    let mut current_name = String::new();
    let mut current_addresses: Vec<String> = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.ends_with(':') && trimmed.to_ascii_lowercase().contains("adapter") {
            push_interface(&mut items, &current_name, &current_addresses);
            current_name = trimmed
                .trim_end_matches(':')
                .split("adapter")
                .last()
                .unwrap_or(trimmed)
                .trim()
                .to_string();
            current_addresses.clear();
        }

        if trimmed.to_ascii_lowercase().contains("ipv4 address") {
            if let Some(addr) = trimmed.split(':').nth(1) {
                let cleaned = addr
                    .trim()
                    .split('(')
                    .next()
                    .unwrap_or(addr)
                    .trim()
                    .to_string();
                if !cleaned.starts_with("127.") {
                    current_addresses.push(cleaned);
                }
            }
        }
    }
    push_interface(&mut items, &current_name, &current_addresses);
    items
}

fn push_interface(items: &mut Vec<NetworkInterfaceSummary>, name: &str, addresses: &[String]) {
    let normalized_name = name.trim();
    if normalized_name.is_empty() || addresses.is_empty() {
        return;
    }

    let reasons = vpn_reasons(normalized_name, addresses);
    items.push(NetworkInterfaceSummary {
        name: normalized_name.to_string(),
        addresses: addresses.to_vec(),
        vpn_like: !reasons.is_empty(),
        reasons,
    });
}

fn vpn_reasons(name: &str, addresses: &[String]) -> Vec<String> {
    let mut reasons = Vec::new();
    let lower_name = name.to_ascii_lowercase();
    let vpn_names = [
        "utun",
        "tun",
        "tap",
        "ppp",
        "wg",
        "wireguard",
        "tailscale",
        "zerotier",
        "clash",
        "surge",
        "sing-box",
        "v2ray",
        "trojan",
        "shadowsocks",
    ];
    if vpn_names.iter().any(|needle| lower_name.contains(needle)) {
        reasons.push(format!("interface name looks like VPN/proxy: {}", name));
    }

    for address in addresses {
        if address.starts_with("100.")
            || address.starts_with("10.7.")
            || address.starts_with("10.8.")
            || address.starts_with("10.10.")
            || address.starts_with("172.16.")
            || address.starts_with("172.17.")
            || address.starts_with("172.18.")
            || address.starts_with("172.19.")
            || address.starts_with("172.20.")
            || address.starts_with("172.21.")
            || address.starts_with("172.22.")
            || address.starts_with("172.23.")
            || address.starts_with("172.24.")
            || address.starts_with("172.25.")
            || address.starts_with("172.26.")
            || address.starts_with("172.27.")
            || address.starts_with("172.28.")
            || address.starts_with("172.29.")
            || address.starts_with("172.30.")
            || address.starts_with("172.31.")
        {
            reasons.push(format!(
                "address is often used by VPN/private overlay: {}",
                address
            ));
            break;
        }
    }

    reasons
}

fn judge_vpn_suspicion(
    proxy: &NetworkProxySnapshot,
    interfaces: &[NetworkInterfaceSummary],
) -> VpnSuspicion {
    let mut reasons = Vec::new();
    let mut score = 0;

    if proxy.enabled {
        score += 40;
        reasons.push(format!("system proxy enabled via {}", proxy.source));
    }

    for item in interfaces.iter().filter(|item| item.vpn_like) {
        score += 35;
        reasons.push(format!("{}: {}", item.name, item.reasons.join(", ")));
    }

    VpnSuspicion {
        suspected: score >= 35,
        score,
        reasons,
    }
}

#[tauri::command]
pub fn write_clipboard_file(path: String) -> Result<(), String> {
    let file_path = std::path::PathBuf::from(&path);
    if !file_path.is_file() {
        return Err(format!("clipboard file not found: {}", path));
    }

    #[cfg(target_os = "macos")]
    {
        return write_clipboard_file_macos(&file_path);
    }

    #[cfg(target_os = "windows")]
    {
        return write_clipboard_file_windows(&file_path);
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("clipboard file write is not supported on this platform".to_string())
    }
}

#[tauri::command]
pub fn start_native_file_drag(window: tauri::WebviewWindow, path: String) -> Result<(), String> {
    let file_path = std::path::PathBuf::from(&path);
    if !file_path.is_file() {
        return Err(format!("drag file not found: {}", path));
    }

    #[cfg(target_os = "macos")]
    {
        return start_native_file_drag_macos(window, file_path);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        Err("native file drag is only supported on macOS".to_string())
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

#[tauri::command]
pub fn stat_local_files(paths: Vec<String>) -> Result<Vec<LocalFileMeta>, String> {
    let mut files = Vec::new();

    for raw_path in paths {
        let path = std::path::PathBuf::from(&raw_path);
        if !path.is_file() {
            continue;
        }
        let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "local-file".to_string());
        files.push(LocalFileMeta {
            path: raw_path,
            name,
            mime: mime_from_path(&path),
            size: metadata.len(),
        });
    }

    Ok(files)
}

#[cfg(target_os = "macos")]
fn write_clipboard_file_macos(path: &std::path::Path) -> Result<(), String> {
    let path_text = path
        .to_string_lossy()
        .replace('\\', "\\\\")
        .replace('"', "\\\"");
    let script = format!(
        r#"
set theFile to POSIX file "{}"
set the clipboard to theFile
"#,
        path_text
    );
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(target_os = "macos")]
fn start_native_file_drag_macos(
    window: tauri::WebviewWindow,
    path: std::path::PathBuf,
) -> Result<(), String> {
    if objc2::MainThreadMarker::new().is_some() {
        return run_native_file_drag_macos(&window, &path);
    }

    let window_for_task = window.clone();
    let (sender, receiver) = std::sync::mpsc::channel();
    window
        .run_on_main_thread(move || {
            let _ = sender.send(run_native_file_drag_macos(&window_for_task, &path));
        })
        .map_err(|e| e.to_string())?;

    receiver.recv().map_err(|e| e.to_string())?
}

#[cfg(target_os = "macos")]
fn run_native_file_drag_macos(
    window: &tauri::WebviewWindow,
    path: &std::path::Path,
) -> Result<(), String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApp, NSView};
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};

    let Some(mtm) = MainThreadMarker::new() else {
        return Err("native file drag must run on the main thread".to_string());
    };

    let ns_view = window.ns_view().map_err(|e| e.to_string())?;
    if ns_view.is_null() {
        return Err("native window view is not available".to_string());
    }

    let app = NSApp(mtm);
    let Some(event) = app.currentEvent() else {
        return Err("native drag event is not available".to_string());
    };

    let filename = NSString::from_str(path.to_string_lossy().as_ref());
    let drag_rect = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(1.0, 1.0));
    let view = unsafe {
        (ns_view as *mut NSView)
            .as_ref()
            .ok_or_else(|| "native window view is not available".to_string())?
    };

    #[allow(deprecated)]
    let accepted = view.dragFile_fromRect_slideBack_event(&filename, drag_rect, false, &event);
    if accepted {
        Ok(())
    } else {
        Err("native file drag was rejected".to_string())
    }
}

#[cfg(target_os = "windows")]
fn write_clipboard_file_windows(path: &std::path::Path) -> Result<(), String> {
    let path_text = path.to_string_lossy().replace('\'', "''");
    let script = format!(
        r#"
Add-Type -AssemblyName System.Windows.Forms
$files = New-Object System.Collections.Specialized.StringCollection
[void]$files.Add('{}')
[System.Windows.Forms.Clipboard]::SetFileDropList($files)
"#,
        path_text
    );
    let output = hidden_windows_command("powershell.exe")
        .args(["-NoProfile", "-Sta", "-Command", &script])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn read_files_from_paths(
    paths: Vec<std::path::PathBuf>,
) -> Result<Vec<ClipboardFilePayload>, String> {
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
    let file_text = String::from_utf8_lossy(&file_output.stdout)
        .trim()
        .to_string();
    if !file_text.is_empty() {
        paths.push(std::path::PathBuf::from(file_text));
        return Ok(paths);
    }

    let png_path = std::env::temp_dir().join(format!("ocs_clipboard_{}.png", uuid::Uuid::new_v4()));
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
    let image_text = String::from_utf8_lossy(&image_output.stdout)
        .trim()
        .to_string();
    if !image_text.is_empty() {
        paths.push(std::path::PathBuf::from(image_text));
        return Ok(paths);
    }

    let tiff_path =
        std::env::temp_dir().join(format!("ocs_clipboard_{}.tiff", uuid::Uuid::new_v4()));
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
    let tiff_text = String::from_utf8_lossy(&tiff_output.stdout)
        .trim()
        .to_string();
    if !tiff_text.is_empty() {
        let converted_path =
            std::env::temp_dir().join(format!("ocs_clipboard_{}.png", uuid::Uuid::new_v4()));
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
    let output = hidden_windows_command("powershell.exe")
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
    let path =
        std::env::temp_dir().join(format!("ocs_clipboard_write_{}.png", uuid::Uuid::new_v4()));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;

    let path_text = path
        .to_string_lossy()
        .replace('\\', "\\\\")
        .replace('"', "\\\"");
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
    let path =
        std::env::temp_dir().join(format!("ocs_clipboard_write_{}.png", uuid::Uuid::new_v4()));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;

    let path_text = path
        .to_string_lossy()
        .replace('\\', "\\\\")
        .replace('"', "\\\"");
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

    let output = hidden_windows_command("powershell.exe")
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
        let file_path =
            std::env::temp_dir().join(format!("ocs_screenshot_{}.png", uuid::Uuid::new_v4()));
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
        hidden_windows_command("explorer.exe")
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
