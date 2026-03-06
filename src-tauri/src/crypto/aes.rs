use aes::cipher::{BlockDecryptMut, BlockEncryptMut, KeyInit};
use aes::Aes256;

type Aes256EcbEnc = ecb::Encryptor<Aes256>;
type Aes256EcbDec = ecb::Decryptor<Aes256>;

use super::CryptoError;

/// AES-256-ECB encrypt with PKCS7 padding (compatible with existing OCS protocol)
pub fn encrypt_ecb(plaintext: &[u8], key: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let key = normalize_key(key);
    let block_size = 16;
    let padding_len = block_size - (plaintext.len() % block_size);
    let mut padded = Vec::with_capacity(plaintext.len() + padding_len);
    padded.extend_from_slice(plaintext);
    padded.extend(std::iter::repeat(padding_len as u8).take(padding_len));

    let encryptor = Aes256EcbEnc::new_from_slice(&key)
        .map_err(|e| CryptoError::AesError(e.to_string()))?;

    let mut buffer = padded;
    for chunk in buffer.chunks_mut(block_size) {
        let block = aes::Block::from_mut_slice(chunk);
        encryptor.clone().encrypt_block_mut(block);
    }
    Ok(buffer)
}

/// AES-256-ECB decrypt with PKCS7 unpadding
pub fn decrypt_ecb(ciphertext: &[u8], key: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if ciphertext.is_empty() || ciphertext.len() % 16 != 0 {
        return Err(CryptoError::AesError("Invalid ciphertext length".into()));
    }

    let key = normalize_key(key);
    let block_size = 16;

    let decryptor = Aes256EcbDec::new_from_slice(&key)
        .map_err(|e| CryptoError::AesError(e.to_string()))?;

    let mut buffer = ciphertext.to_vec();
    for chunk in buffer.chunks_mut(block_size) {
        let block = aes::Block::from_mut_slice(chunk);
        decryptor.clone().decrypt_block_mut(block);
    }

    // PKCS7 unpadding
    let pad_len = *buffer.last().unwrap_or(&0) as usize;
    if pad_len == 0 || pad_len > block_size {
        return Err(CryptoError::AesError("Invalid PKCS7 padding".into()));
    }
    buffer.truncate(buffer.len() - pad_len);
    Ok(buffer)
}

/// AES-256-ECB encrypt returning hex string (for API requests)
pub fn encrypt_ecb_hex(plaintext: &str, key: &[u8]) -> Result<String, CryptoError> {
    let encrypted = encrypt_ecb(plaintext.as_bytes(), key)?;
    Ok(hex::encode(encrypted))
}

/// AES-256-ECB decrypt from hex string
pub fn decrypt_ecb_hex(hex_ciphertext: &str, key: &[u8]) -> Result<String, CryptoError> {
    let ciphertext = hex::decode(hex_ciphertext)
        .map_err(|e| CryptoError::AesError(e.to_string()))?;
    let decrypted = decrypt_ecb(&ciphertext, key)?;
    String::from_utf8(decrypted).map_err(|e| CryptoError::AesError(e.to_string()))
}

fn normalize_key(key: &[u8]) -> Vec<u8> {
    let mut normalized = vec![0u8; 32];
    let len = key.len().min(32);
    normalized[..len].copy_from_slice(&key[..len]);
    normalized
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = b"0123456789abcdef0123456789abcdef";
        let plaintext = b"Hello, OCS Chat!";
        let encrypted = encrypt_ecb(plaintext, key).unwrap();
        let decrypted = decrypt_ecb(&encrypted, key).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_encrypt_decrypt_hex() {
        let key = b"0123456789abcdef0123456789abcdef";
        let plaintext = "Test message";
        let hex = encrypt_ecb_hex(plaintext, key).unwrap();
        let result = decrypt_ecb_hex(&hex, key).unwrap();
        assert_eq!(result, plaintext);
    }
}
