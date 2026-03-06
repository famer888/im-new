use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

use crate::crypto;

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadResult {
    pub url: String,
    pub file_key: String,
    pub file_size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub msg_id: String,
    pub progress: f64, // 0.0 - 1.0
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub status: String, // "downloading", "decrypting", "done", "error"
}

#[tauri::command]
pub async fn upload_file(
    crypto_engine: State<'_, crypto::CryptoEngine>,
    file_path: String,
    _uid: String,
) -> Result<UploadResult, String> {
    let path = PathBuf::from(&file_path);
    let file_key = crypto::file_crypto::generate_file_key();

    let _encrypted =
        crypto::file_crypto::encrypt_file(&path, file_key.as_bytes())
            .await
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
        let result =
            crypto::file_crypto::download_and_decrypt(&url, file_key.as_bytes(), &path)
                .await;

        match result {
            Ok(size) => {
                let _ = app_clone.emit(
                    &format!("file:done:{}", msg_id_clone),
                    DownloadProgress {
                        msg_id: msg_id_clone,
                        progress: 1.0,
                        total_bytes: size,
                        downloaded_bytes: size,
                        status: "done".to_string(),
                    },
                );
            }
            Err(e) => {
                let _ = app_clone.emit(
                    &format!("file:error:{}", msg_id_clone),
                    serde_json::json!({ "error": e.to_string() }),
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
    })
}
