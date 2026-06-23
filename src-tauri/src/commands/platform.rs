use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use tauri::Emitter;

#[cfg(target_os = "windows")]
use std::time::{Duration, Instant};

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

#[cfg(target_os = "windows")]
fn decode_windows_text_output(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }

    if let Ok(text) = String::from_utf8(bytes.to_vec()) {
        return text;
    }

    // Windows PowerShell 5.x 常把 stdout 写成 UTF-16LE，这里做兜底解码避免粘贴乱码。
    let utf16_bytes = if bytes.starts_with(&[0xFF, 0xFE]) {
        &bytes[2..]
    } else {
        bytes
    };
    let likely_utf16le = utf16_bytes.len() >= 2
        && utf16_bytes.len() % 2 == 0
        && utf16_bytes
            .chunks_exact(2)
            .take(64)
            .filter(|chunk| chunk[1] == 0)
            .count()
            >= 8;
    if likely_utf16le {
        let units: Vec<u16> = utf16_bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        return String::from_utf16_lossy(&units)
            .trim_end_matches('\u{0}')
            .to_string();
    }

    String::from_utf8_lossy(bytes).to_string()
}

#[cfg(target_os = "windows")]
fn command_status_with_timeout(
    command: &mut std::process::Command,
    timeout: Duration,
) -> Result<std::process::ExitStatus, String> {
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let started_at = Instant::now();

    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return Ok(status);
        }

        if started_at.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err("clipboard command timed out".to_string());
        }

        std::thread::sleep(Duration::from_millis(50));
    }
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
        return read_clipboard_text_macos();
    }

    #[cfg(target_os = "windows")]
    {
        let output = hidden_windows_command("powershell.exe")
            .args([
                "-NoProfile",
                "-Command",
                "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Clipboard -Raw",
            ])
            .output()
            .map_err(|e| e.to_string())?;
        return Ok(decode_windows_text_output(&output.stdout));
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
        return write_clipboard_text_macos(&text);
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

#[cfg(target_os = "macos")]
fn read_clipboard_text_macos() -> Result<String, String> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};

    let pasteboard = NSPasteboard::generalPasteboard();
    Ok(pasteboard
        .stringForType(unsafe { NSPasteboardTypeString })
        .map(|value| value.to_string())
        .unwrap_or_default())
}

#[cfg(target_os = "macos")]
fn write_clipboard_text_macos(text: &str) -> Result<(), String> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
    use objc2_foundation::NSString;

    let pasteboard = NSPasteboard::generalPasteboard();
    let text = NSString::from_str(text);
    // mac 打包环境里 pbcopy 可能返回成功但剪贴板为空；直接走 NSPasteboard 写入系统剪贴板。
    pasteboard.clearContents();
    if pasteboard.setString_forType(&text, unsafe { NSPasteboardTypeString }) {
        Ok(())
    } else {
        Err("failed to write text to pasteboard".to_string())
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
pub fn write_clipboard_image_from_path(path: String) -> Result<(), String> {
    let file_path = std::path::PathBuf::from(path.trim());
    if !file_path.is_file() {
        return Err(format!(
            "clipboard image file not found: {}",
            file_path.to_string_lossy()
        ));
    }

    #[cfg(target_os = "macos")]
    {
        return write_clipboard_image_from_path_macos(&file_path);
    }

    #[cfg(target_os = "windows")]
    {
        return write_clipboard_image_from_path_windows(&file_path);
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = file_path;
        Err("clipboard image path write is not supported on this platform".to_string())
    }
}

fn clipboard_image_temp_extension(
    content_type: Option<&str>,
    url: &str,
    bytes: &[u8],
) -> &'static str {
    let content_type = content_type.unwrap_or_default().to_ascii_lowercase();
    if content_type.contains("png") || bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return "png";
    }
    if content_type.contains("jpeg")
        || content_type.contains("jpg")
        || bytes.starts_with(&[0xFF, 0xD8, 0xFF])
    {
        return "jpg";
    }
    if content_type.contains("gif") || bytes.starts_with(b"GIF8") {
        return "gif";
    }
    if content_type.contains("webp")
        || (bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP")
    {
        return "webp";
    }
    if content_type.contains("bmp") || bytes.starts_with(b"BM") {
        return "bmp";
    }
    if content_type.contains("tiff") || bytes.starts_with(b"II*\0") || bytes.starts_with(b"MM\0*") {
        return "tiff";
    }

    let path = url
        .split('?')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        "jpg"
    } else if path.ends_with(".gif") {
        "gif"
    } else if path.ends_with(".webp") {
        "webp"
    } else if path.ends_with(".bmp") {
        "bmp"
    } else if path.ends_with(".tif") || path.ends_with(".tiff") {
        "tiff"
    } else {
        "png"
    }
}

#[tauri::command]
pub async fn write_clipboard_image_from_url(url: String) -> Result<(), String> {
    const MAX_CLIPBOARD_IMAGE_BYTES: usize = 30 * 1024 * 1024;

    let url = url.trim();
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("invalid image url: {}", e))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("clipboard image url must be http or https".to_string());
    }

    // 桌面端远端图片由主进程下载，避开 WebView 对 97/55 图片域名的 CORS 限制。
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("create image request client failed: {}", e))?
        .get(parsed)
        .send()
        .await
        .map_err(|e| format!("download clipboard image failed: {}", e))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("download clipboard image failed: HTTP {}", status));
    }

    if response
        .content_length()
        .is_some_and(|size| size > MAX_CLIPBOARD_IMAGE_BYTES as u64)
    {
        return Err("clipboard image is too large".to_string());
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("read clipboard image body failed: {}", e))?;
    if bytes.is_empty() {
        return Err("clipboard image body is empty".to_string());
    }
    if bytes.len() > MAX_CLIPBOARD_IMAGE_BYTES {
        return Err("clipboard image is too large".to_string());
    }

    let ext = clipboard_image_temp_extension(content_type.as_deref(), url, bytes.as_ref());
    let temp_path = std::env::temp_dir().join(format!(
        "ocs_clipboard_url_{}.{}",
        uuid::Uuid::new_v4(),
        ext
    ));
    tokio::fs::write(&temp_path, bytes.as_ref())
        .await
        .map_err(|e| format!("write clipboard image temp file failed: {}", e))?;

    let result = write_clipboard_image_from_path(temp_path.to_string_lossy().to_string());
    let _ = tokio::fs::remove_file(&temp_path).await;
    result
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

    #[cfg(target_os = "windows")]
    {
        let _ = window;
        return start_native_file_drag_windows(&file_path);
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = window;
        Err("native file drag is only supported on macOS and Windows".to_string())
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

    let view = unsafe {
        (ns_view as *mut NSView)
            .as_ref()
            .ok_or_else(|| "native window view is not available".to_string())?
    };
    let filename = NSString::from_str(path.to_string_lossy().as_ref());
    let window_point = event.locationInWindow();
    let view_point = view.convertPoint_fromView(window_point, None);
    // 拖拽起点必须跟随当前鼠标位置，避免图标从窗口左下角（0,0）“飞过来”。
    let drag_rect = NSRect::new(
        NSPoint::new(view_point.x - 0.5, view_point.y - 0.5),
        NSSize::new(1.0, 1.0),
    );

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

#[cfg(target_os = "windows")]
fn start_native_file_drag_windows(path: &std::path::Path) -> Result<(), String> {
    let path_text = path.to_string_lossy().replace('\'', "''");
    let script = format!(
        r#"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$files = New-Object System.Collections.Specialized.StringCollection
[void]$files.Add('{path}')
$data = New-Object System.Windows.Forms.DataObject
$data.SetFileDropList($files)
$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.ShowInTaskbar = $false
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.Location = New-Object System.Drawing.Point(-32000, -32000)
$form.Size = New-Object System.Drawing.Size(1, 1)
$form.Opacity = 0.01
$form.TopMost = $true
$form.Add_Shown({{
  try {{
    [void]$form.DoDragDrop($data, [System.Windows.Forms.DragDropEffects]::Copy)
  }} finally {{
    $form.Close()
  }}
}})
[System.Windows.Forms.Application]::Run($form)
"#,
        path = path_text
    );

    // Windows 从桌面应用拖出文件时，需走 OLE DoDragDrop 才能被资源管理器接收；
    // 这里改为后台启动并立即返回，避免前端 invoke 等待拖拽结束导致窗口假死。
    let mut command = hidden_windows_command("powershell.exe");
    command.args(["-NoProfile", "-Sta", "-Command", &script]);
    command
        .spawn()
        .map_err(|e| format!("spawn native drag command failed: {}", e))?;
    Ok(())
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
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "txt" => "text/plain",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
    .to_string()
}

#[cfg(target_os = "macos")]
fn write_clipboard_image_macos(bytes: &[u8]) -> Result<(), String> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypePNG};
    use objc2_foundation::NSData;

    let pasteboard = NSPasteboard::generalPasteboard();
    pasteboard.clearContents();
    let data = NSData::with_bytes(bytes);
    if pasteboard.setData_forType(Some(&data), unsafe { NSPasteboardTypePNG }) {
        Ok(())
    } else {
        Err("failed to write PNG data to pasteboard".to_string())
    }
}

#[cfg(target_os = "macos")]
fn is_png_bytes(bytes: &[u8]) -> bool {
    bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A])
}

#[cfg(target_os = "macos")]
fn write_clipboard_image_from_path_macos(path: &std::path::Path) -> Result<(), String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    if is_png_bytes(&bytes) {
        return write_clipboard_image_macos(&bytes);
    }

    let png_path =
        std::env::temp_dir().join(format!("ocs_clipboard_path_{}.png", uuid::Uuid::new_v4()));
    // 对齐旧 im：本地图片复制不走 local-resource/asset fetch，先由系统工具转 PNG，再写入系统剪贴板。
    let status = std::process::Command::new("sips")
        .arg("-s")
        .arg("format")
        .arg("png")
        .arg(path)
        .arg("--out")
        .arg(&png_path)
        .status()
        .map_err(|e| e.to_string());
    let status = match status {
        Ok(status) => status,
        Err(error) => {
            let _ = std::fs::remove_file(&png_path);
            return Err(error);
        }
    };
    if !status.success() {
        let _ = std::fs::remove_file(&png_path);
        return Err(format!(
            "sips image conversion failed with status: {}",
            status
        ));
    }

    let png_bytes = std::fs::read(&png_path).map_err(|e| e.to_string());
    let _ = std::fs::remove_file(&png_path);
    write_clipboard_image_macos(&png_bytes?)
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

    let mut command = hidden_windows_command("powershell.exe");
    command.args(["-NoProfile", "-Sta", "-Command", &script]);
    let status = command_status_with_timeout(&mut command, Duration::from_secs(6));

    let _ = std::fs::remove_file(&path);

    let status = status?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("SetImage failed with status: {}", status))
    }
}

#[cfg(target_os = "windows")]
fn write_clipboard_image_from_path_windows(path: &std::path::Path) -> Result<(), String> {
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

    let mut command = hidden_windows_command("powershell.exe");
    command.args(["-NoProfile", "-Sta", "-Command", &script]);
    // Windows 直接让 System.Drawing 从磁盘读图，避免 WebView fetch 本地资源时受 CORS/协议限制。
    let status = command_status_with_timeout(&mut command, Duration::from_secs(6))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "SetImage clipboard from path failed with status: {}",
            status
        ))
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
