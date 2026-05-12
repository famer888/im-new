use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use tauri::{Emitter, State};
use base64::{engine::general_purpose, Engine as _};

use crate::crypto;

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadResult {
    pub url: String,
    pub file_key: String,
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub msg_id: String,
    pub progress: f64, // 0.0 - 1.0
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub status: String, // "downloading", "decrypting", "done", "error"
    pub data_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OssPutObjectRequest {
    pub url: String,
    pub bucket: String,
    pub object_key: String,
    pub access_key_id: String,
    pub access_key_secret: String,
    pub security_token: String,
    pub content_type: String,
    pub body_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OssPutObjectResult {
    pub status: u16,
    pub ok: bool,
    pub body: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageSendLogPayload {
    pub level: Option<String>,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

static AUDIO_PLAYERS: OnceLock<Mutex<HashMap<String, Child>>> = OnceLock::new();

fn audio_players() -> &'static Mutex<HashMap<String, Child>> {
    AUDIO_PLAYERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn stop_audio_children(players: &mut HashMap<String, Child>, keep_id: Option<&str>) {
    let ids: Vec<String> = players.keys().cloned().collect();
    for id in ids {
        if keep_id == Some(id.as_str()) {
            continue;
        }
        if let Some(mut child) = players.remove(&id) {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[tauri::command]
pub fn image_send_log(payload: ImageSendLogPayload) -> Result<(), String> {
    let data = payload
        .data
        .map(|value| value.to_string())
        .unwrap_or_else(|| "{}".to_string());

    let is_audio_log = payload.message.starts_with("[audio-message]")
        || payload.message.starts_with("[group-audio]");
    let is_group_audio_log = payload.message.starts_with("[group-audio]");
    let is_file_log = payload.message.starts_with("[file-send]");
    if payload.message.contains("[single-video-send]") {
        println!(
            "[single-video-send][terminal][{}] {} data={}",
            payload.level.as_deref().unwrap_or("info"),
            payload.message,
            data
        );
    }
    match (
        is_audio_log,
        is_group_audio_log,
        is_file_log,
        payload.level.as_deref().unwrap_or("info"),
    ) {
        (true, true, _, "error") => tracing::error!(target: "group-audio", data = %data, "{}", payload.message),
        (true, true, _, "warn") => tracing::warn!(target: "group-audio", data = %data, "{}", payload.message),
        (true, true, _, _) => tracing::info!(target: "group-audio", data = %data, "{}", payload.message),
        (true, false, _, "error") => tracing::error!(target: "audio-message", data = %data, "{}", payload.message),
        (true, false, _, "warn") => tracing::warn!(target: "audio-message", data = %data, "{}", payload.message),
        (true, false, _, _) => tracing::info!(target: "audio-message", data = %data, "{}", payload.message),
        (false, _, true, "error") => tracing::error!(target: "file-send", data = %data, "{}", payload.message),
        (false, _, true, "warn") => tracing::warn!(target: "file-send", data = %data, "{}", payload.message),
        (false, _, true, _) => tracing::info!(target: "file-send", data = %data, "{}", payload.message),
        (false, _, false, "error") => tracing::error!(target: "image-send", data = %data, "{}", payload.message),
        (false, _, false, "warn") => tracing::warn!(target: "image-send", data = %data, "{}", payload.message),
        (false, _, false, _) => tracing::info!(target: "image-send", data = %data, "{}", payload.message),
    }

    Ok(())
}

#[tauri::command]
pub fn play_audio_file(msg_id: String, file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("audio file not found: {}", file_path));
    }

    let mut players = audio_players()
        .lock()
        .map_err(|_| "audio player lock poisoned".to_string())?;
    stop_audio_children(&mut players, None);

    #[cfg(target_os = "macos")]
    let child = Command::new("afplay")
        .arg(&path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("spawn afplay failed: {}", e))?;

    #[cfg(not(target_os = "macos"))]
    let child = {
        return Err("audio playback is currently only implemented on macOS".to_string());
    };

    players.insert(msg_id.clone(), child);
    Ok(())
}

#[tauri::command]
pub fn stop_audio_file(msg_id: Option<String>) -> Result<(), String> {
    let mut players = audio_players()
        .lock()
        .map_err(|_| "audio player lock poisoned".to_string())?;

    if let Some(id) = msg_id {
        if let Some(mut child) = players.remove(&id) {
            let _ = child.kill();
            let _ = child.wait();
        }
    } else {
        stop_audio_children(&mut players, None);
    }
    Ok(())
}

fn hmac_sha1_base64(secret: &str, message: &str) -> String {
    let mut key = secret.as_bytes().to_vec();
    if key.len() > 64 {
        key = Sha1::digest(&key).to_vec();
    }
    key.resize(64, 0);

    let mut ipad = [0x36_u8; 64];
    let mut opad = [0x5c_u8; 64];
    for (idx, byte) in key.iter().enumerate() {
        ipad[idx] ^= byte;
        opad[idx] ^= byte;
    }

    let mut inner = Sha1::new();
    inner.update(ipad);
    inner.update(message.as_bytes());
    let inner_hash = inner.finalize();

    let mut outer = Sha1::new();
    outer.update(opad);
    outer.update(inner_hash);
    general_purpose::STANDARD.encode(outer.finalize())
}

fn oss_rfc1123_date() -> String {
    chrono::Utc::now()
        .format("%a, %d %b %Y %H:%M:%S GMT")
        .to_string()
}

fn sniff_image_mime(bytes: &[u8]) -> &'static str {
    if bytes.len() >= 8
        && bytes[0] == 0x89
        && bytes[1] == b'P'
        && bytes[2] == b'N'
        && bytes[3] == b'G'
    {
        return "image/png";
    }
    if bytes.len() >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff {
        return "image/jpeg";
    }
    if bytes.len() >= 6 && (&bytes[..6] == b"GIF87a" || &bytes[..6] == b"GIF89a") {
        return "image/gif";
    }
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return "image/webp";
    }
    if bytes.len() >= 2 && &bytes[..2] == b"BM" {
        return "image/bmp";
    }
    if bytes.len() >= 12 && (&bytes[4..12] == b"ftypavif" || &bytes[4..12] == b"ftypavis") {
        return "image/avif";
    }
    let head_len = bytes.len().min(200);
    if let Ok(head) = std::str::from_utf8(&bytes[..head_len]) {
        let trimmed = head.trim_start();
        if trimmed.starts_with("<svg") || trimmed.starts_with("<?xml") {
            return "image/svg+xml";
        }
    }
    "image/png"
}

fn bytes_head_hex(bytes: &[u8], len: usize) -> String {
    bytes
        .iter()
        .take(len)
        .map(|byte| format!("{:02X}", byte))
        .collect::<Vec<_>>()
        .join(" ")
}

#[tauri::command]
pub async fn upload_file(
    crypto_engine: State<'_, crypto::CryptoEngine>,
    file_path: String,
    _uid: String,
) -> Result<UploadResult, String> {
    let path = PathBuf::from(&file_path);
    let file_key = crypto::file_crypto::generate_file_key();

    let encrypted_path = path.with_extension("enc");
    crypto::file_crypto::encrypt_file(
        path.to_str().unwrap_or_default(),
        encrypted_path.to_str().unwrap_or_default(),
        &file_key,
    )
    .map_err(|e| e.to_string())?;

    // TODO: Upload encrypted data to OSS
    Ok(UploadResult {
        url: String::new(),
        file_key,
        file_size: 0,
    })
}

#[tauri::command]
pub async fn upload_oss_object(request: OssPutObjectRequest) -> Result<OssPutObjectResult, String> {
    let body = general_purpose::STANDARD
        .decode(request.body_base64.trim())
        .map_err(|e| format!("decode upload body failed: {}", e))?;
    let oss_date = oss_rfc1123_date();
    let content_type = if request.content_type.trim().is_empty() {
        "application/octet-stream".to_string()
    } else {
        request.content_type.trim().to_string()
    };
    let url = url::Url::parse(&request.url)
        .map_err(|e| format!("invalid oss upload url: {}", e))?;
    let object_path = url.path().trim_start_matches('/');
    let object_key = if object_path.is_empty() {
        request.object_key.trim_start_matches('/')
    } else {
        object_path
    };
    let canonical_resource = format!("/{}/{}", request.bucket.trim(), object_key);
    let canonical_headers = format!(
        "x-oss-date:{}\nx-oss-security-token:{}\n",
        oss_date,
        request.security_token
    );
    let string_to_sign = format!(
        "PUT\n\n{}\n{}\n{}{}",
        content_type, oss_date, canonical_headers, canonical_resource
    );
    let signature = hmac_sha1_base64(&request.access_key_secret, &string_to_sign);
    let authorization = format!("OSS {}:{}", &request.access_key_id, signature);

    tracing::info!(
        target: "image-send",
        "rust oss put start url_host={} body_bytes={} bucket={} object_key_head={} object_key_len={} content_type={} has_access_key={} has_secret={} has_token={} canonical_resource_head={} sign_len={}",
        url.host_str().unwrap_or_default(),
        body.len(),
        request.bucket,
        object_key.chars().take(24).collect::<String>(),
        object_key.len(),
        content_type,
        !request.access_key_id.is_empty(),
        !request.access_key_secret.is_empty(),
        !request.security_token.is_empty(),
        canonical_resource,
        string_to_sign.len(),
    );

    let response = reqwest::Client::new()
        .put(url)
        .header("Authorization", authorization)
        .header("x-oss-date", oss_date)
        .header("Content-Type", content_type)
        .header("x-oss-security-token", request.security_token)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("oss put request failed: {}", e))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .unwrap_or_else(|e| format!("read oss response failed: {}", e));
    let body_preview: String = text.chars().take(4000).collect();

    tracing::info!(
        target: "image-send",
        "rust oss put response status={} ok={} body_head={}",
        status.as_u16(),
        status.is_success(),
        body_preview,
    );

    if !status.is_success() {
        return Err(format!(
            "oss put failed: HTTP {} {}",
            status.as_u16(),
            body_preview
        ));
    }

    Ok(OssPutObjectResult {
        status: status.as_u16(),
        ok: true,
        body: body_preview,
    })
}

#[tauri::command]
pub async fn download_file(
    app: tauri::AppHandle,
    url: String,
    file_key: String,
    save_path: String,
    msg_id: String,
    log_tag: Option<String>,
) -> Result<(), String> {
    let path = PathBuf::from(&save_path);
    let should_log_audio = log_tag.as_deref() == Some("group-audio");
    if should_log_audio {
        tracing::info!(
            target: "group-audio",
            "download_file request msg_id={} url_head={} save_path={} file_key_head={} file_key_len={}",
            msg_id,
            url.chars().take(120).collect::<String>(),
            save_path,
            file_key.chars().take(10).collect::<String>(),
            file_key.len(),
        );
    }

    let app_clone = app.clone();
    let msg_id_clone = msg_id.clone();
    let should_log_audio_clone = should_log_audio;

    tokio::spawn(async move {
        let download_result = async {
            if tokio::fs::try_exists(&path).await.unwrap_or(false) {
                let decoded = tokio::fs::read(&path)
                    .await
                    .map_err(|e| format!("Read cached file failed: {}", e))?;
                if should_log_audio_clone {
                    tracing::info!(
                        target: "group-audio",
                        "download_file cache hit msg_id={} path={} bytes={} head_hex={}",
                        msg_id_clone,
                        path.to_string_lossy(),
                        decoded.len(),
                        bytes_head_hex(&decoded, 16),
                    );
                }
                let mime = sniff_image_mime(&decoded);
                let data_url = format!(
                    "data:{};base64,{}",
                    mime,
                    general_purpose::STANDARD.encode(&decoded)
                );
                return Ok::<(u64, String), String>((decoded.len() as u64, data_url));
            }

            if should_log_audio_clone {
                tracing::info!(
                    target: "group-audio",
                    "download_file http start msg_id={} url_head={}",
                    msg_id_clone,
                    url.chars().take(120).collect::<String>(),
                );
            }
            let response = reqwest::get(&url)
                .await
                .map_err(|e| format!("Download failed: {}", e))?;
            let status = response.status();
            if should_log_audio_clone {
                tracing::info!(
                    target: "group-audio",
                    "download_file http response msg_id={} status={} ok={}",
                    msg_id_clone,
                    status.as_u16(),
                    status.is_success(),
                );
            }
            if !status.is_success() {
                let body = response
                    .text()
                    .await
                    .unwrap_or_else(|e| format!("read error body failed: {}", e));
                return Err(format!(
                    "Download failed: HTTP {} body_head={}",
                    status.as_u16(),
                    body.chars().take(400).collect::<String>()
                ));
            }
            let bytes = response
                .bytes()
                .await
                .map_err(|e| format!("Read body failed: {}", e))?;
            if should_log_audio_clone {
                tracing::info!(
                    target: "group-audio",
                    "download_file http body msg_id={} encrypted_bytes={} encrypted_head_hex={}",
                    msg_id_clone,
                    bytes.len(),
                    bytes_head_hex(&bytes, 16),
                );
            }

            if let Some(parent) = path.parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("Create cache dir failed: {}", e))?;
            }

            let enc_path = path.with_extension("enc");
            tokio::fs::write(&enc_path, &bytes)
                .await
                .map_err(|e| format!("Write encrypted file failed: {}", e))?;

            if should_log_audio_clone {
                tracing::info!(
                    target: "group-audio",
                    "download_file decrypt start msg_id={} enc_path={} out_path={} file_key_head={} file_key_len={}",
                    msg_id_clone,
                    enc_path.to_string_lossy(),
                    path.to_string_lossy(),
                    file_key.chars().take(10).collect::<String>(),
                    file_key.len(),
                );
            }
            crypto::file_crypto::decrypt_file(
                enc_path.to_str().unwrap_or_default(),
                path.to_str().unwrap_or_default(),
                &file_key,
            )
            .map_err(|e| format!("Decrypt failed: {}", e))?;

            let _ = tokio::fs::remove_file(&enc_path).await;
            let meta = tokio::fs::metadata(&path)
                .await
                .map_err(|e| format!("Stat failed: {}", e))?;
            let decoded = tokio::fs::read(&path)
                .await
                .map_err(|e| format!("Read decrypted file failed: {}", e))?;
            if should_log_audio_clone {
                tracing::info!(
                    target: "group-audio",
                    "download_file decrypt done msg_id={} decoded_bytes={} decoded_head_hex={}",
                    msg_id_clone,
                    decoded.len(),
                    bytes_head_hex(&decoded, 16),
                );
            }
            let mime = sniff_image_mime(&decoded);
            let data_url = format!(
                "data:{};base64,{}",
                mime,
                general_purpose::STANDARD.encode(decoded)
            );
            Ok::<(u64, String), String>((meta.len(), data_url))
        }
        .await;

        match download_result {
            Ok((size, data_url)) => {
                if should_log_audio_clone {
                    tracing::info!(
                        target: "group-audio",
                        "download_file emit done msg_id={} size={}",
                        msg_id_clone,
                        size,
                    );
                }
                let _ = app_clone.emit(
                    &format!("file:done:{}", msg_id_clone),
                    DownloadProgress {
                        msg_id: msg_id_clone,
                        progress: 1.0,
                        total_bytes: size,
                        downloaded_bytes: size,
                        status: "done".to_string(),
                        data_url: Some(data_url),
                    },
                );
            }
            Err(e) => {
                if should_log_audio_clone {
                    tracing::error!(
                        target: "group-audio",
                        "download_file emit error msg_id={} error={}",
                        msg_id_clone,
                        e,
                    );
                }
                let _ = app_clone.emit(
                    &format!("file:error:{}", msg_id_clone),
                    serde_json::json!({ "error": e }),
                );
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn get_download_progress(msg_id: String) -> Result<DownloadProgress, String> {
    Ok(DownloadProgress {
        msg_id,
        progress: 0.0,
        total_bytes: 0,
        downloaded_bytes: 0,
        status: "idle".to_string(),
        data_url: None,
    })
}

#[tauri::command]
pub async fn save_base64_image(file_path: String, base64_data: String) -> Result<(), String> {
    let mut payload = base64_data.trim().to_string();
    if let Some(idx) = payload.find(',') {
        payload = payload[idx + 1..].to_string();
    }

    let bytes = general_purpose::STANDARD
        .decode(payload)
        .map_err(|e| format!("decode base64 failed: {}", e))?;

    let path = PathBuf::from(file_path);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("create parent dir failed: {}", e))?;
    }

    tokio::fs::write(path, bytes)
        .await
        .map_err(|e| format!("write image file failed: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn copy_file_overwrite(source_path: String, target_path: String) -> Result<(), String> {
    let source = PathBuf::from(&source_path);
    if !source.is_file() {
        return Err(format!("source file not found: {}", source_path));
    }

    let target = PathBuf::from(&target_path);
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("create parent dir failed: {}", e))?;
    }

    tokio::fs::copy(&source, &target)
        .await
        .map_err(|e| format!("copy file failed: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    Ok(tokio::fs::metadata(PathBuf::from(path)).await.is_ok())
}

#[tauri::command]
pub async fn reveal_file_in_directory(path: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    if !file_path.is_file() {
        return Err(format!("file not found: {}", path));
    }

    #[cfg(target_os = "macos")]
    {
        let reveal_status = Command::new("open")
            .arg("-R")
            .arg(&file_path)
            .status()
            .map_err(|e| format!("reveal file failed: {}", e))?;
        if !reveal_status.success() {
            return Err(format!("reveal file failed with status: {}", reveal_status));
        }

        let activate_status = Command::new("open")
            .arg("-a")
            .arg("Finder")
            .status()
            .map_err(|e| format!("activate Finder failed: {}", e))?;
        if activate_status.success() {
            return Ok(());
        }
        return Err(format!("activate Finder failed with status: {}", activate_status));
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(format!("/select,{}", file_path.to_string_lossy()))
            .spawn()
            .map_err(|e| format!("reveal file failed: {}", e))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let directory = file_path
            .parent()
            .ok_or_else(|| format!("directory not found for file: {}", path))?;
        Command::new("xdg-open")
            .arg(directory)
            .spawn()
            .map_err(|e| format!("open directory failed: {}", e))?;
        Ok(())
    }
}
