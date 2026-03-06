use base64::{engine::general_purpose::STANDARD, Engine};
use rsa::pkcs8::{DecodePrivateKey, DecodePublicKey};
use rsa::{Pkcs1v15Encrypt, RsaPrivateKey, RsaPublicKey};

use super::CryptoError;

/// RSA encrypt with public key (compatible with JSEncrypt)
pub fn encrypt(plaintext: &[u8], public_key_pem: &str) -> Result<Vec<u8>, CryptoError> {
    let public_key = RsaPublicKey::from_public_key_pem(public_key_pem)
        .map_err(|e| CryptoError::RsaError(format!("Parse public key failed: {}", e)))?;

    let mut rng = rand::thread_rng();
    public_key
        .encrypt(&mut rng, Pkcs1v15Encrypt, plaintext)
        .map_err(|e| CryptoError::RsaError(format!("Encrypt failed: {}", e)))
}

/// RSA decrypt with private key
pub fn decrypt(ciphertext: &[u8], private_key_pem: &str) -> Result<Vec<u8>, CryptoError> {
    let private_key = RsaPrivateKey::from_pkcs8_pem(private_key_pem)
        .map_err(|e| CryptoError::RsaError(format!("Parse private key failed: {}", e)))?;

    private_key
        .decrypt(Pkcs1v15Encrypt, ciphertext)
        .map_err(|e| CryptoError::RsaError(format!("Decrypt failed: {}", e)))
}

/// RSA encrypt long data (split into 117-byte chunks, compatible with JSEncrypt.encryptLong)
pub fn encrypt_long(plaintext: &[u8], public_key_pem: &str) -> Result<String, CryptoError> {
    let public_key = RsaPublicKey::from_public_key_pem(public_key_pem)
        .map_err(|e| CryptoError::RsaError(format!("Parse public key failed: {}", e)))?;

    let chunk_size = 117; // RSA 2048 with PKCS1v15 padding
    let mut result = Vec::new();
    let mut rng = rand::thread_rng();

    for chunk in plaintext.chunks(chunk_size) {
        let encrypted = public_key
            .encrypt(&mut rng, Pkcs1v15Encrypt, chunk)
            .map_err(|e| CryptoError::RsaError(format!("Encrypt chunk failed: {}", e)))?;
        result.extend_from_slice(&encrypted);
    }

    Ok(STANDARD.encode(&result))
}
