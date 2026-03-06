use super::{aes, CryptoError};
use std::path::Path;
use tokio::io::AsyncWriteExt;
use tracing::{error, info};

const CHUNK_SIZE: usize = 16 * 1024; // 16KB

/// Stream-decrypt a file from a URL and save to disk
pub async fn download_and_decrypt(
    url: &str,
    key: &[u8],
    save_path: &Path,
) -> Result<u64, CryptoError> {
    let response = reqwest::get(url)
        .await
        .map_err(|e| CryptoError::AesError(format!("Download failed: {}", e)))?;

    let total_size = response.content_length().unwrap_or(0);
    let bytes = response
        .bytes()
        .await
        .map_err(|e| CryptoError::AesError(format!("Read body failed: {}", e)))?;

    let decrypted = aes::decrypt_ecb(&bytes, key)?;

    let mut file = tokio::fs::File::create(save_path)
        .await
        .map_err(|e| CryptoError::AesError(format!("Create file failed: {}", e)))?;

    file.write_all(&decrypted)
        .await
        .map_err(|e| CryptoError::AesError(format!("Write file failed: {}", e)))?;

    info!("File decrypted and saved: {:?} ({} bytes)", save_path, decrypted.len());
    Ok(decrypted.len() as u64)
}

/// Encrypt a local file for upload
pub async fn encrypt_file(
    file_path: &Path,
    key: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    let data = tokio::fs::read(file_path)
        .await
        .map_err(|e| CryptoError::AesError(format!("Read file failed: {}", e)))?;

    aes::encrypt_ecb(&data, key)
}

/// Generate a random file encryption key (16 bytes hex = 32 chars)
pub fn generate_file_key() -> String {
    let key: [u8; 16] = rand::random();
    hex::encode(key)
}
