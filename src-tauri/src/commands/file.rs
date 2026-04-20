use serde::{Deserialize, Serialize};
use std::path::PathBuf;
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
pub async fn download_file(
    app: tauri::AppHandle,
    url: String,
    file_key: String,
    save_path: String,
    msg_id: String,
) -> Result<(), String> {
    let path = PathBuf::from(&save_path);

    let app_clone = app.clone();
    let msg_id_clone = msg_id.clone();

    tokio::spawn(async move {
        let download_result = async {
            let response = reqwest::get(&url)
                .await
                .map_err(|e| format!("Download failed: {}", e))?;
            let bytes = response
                .bytes()
                .await
                .map_err(|e| format!("Read body failed: {}", e))?;

            if let Some(parent) = path.parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("Create cache dir failed: {}", e))?;
            }

            let enc_path = path.with_extension("enc");
            tokio::fs::write(&enc_path, &bytes)
                .await
                .map_err(|e| format!("Write encrypted file failed: {}", e))?;

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
