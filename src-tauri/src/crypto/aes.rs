use aes::cipher::{BlockDecryptMut, BlockEncryptMut, KeyInit};
use aes::{Aes128, Aes256};

type Aes128EcbEnc = ecb::Encryptor<Aes128>;
type Aes128EcbDec = ecb::Decryptor<Aes128>;
type Aes256EcbEnc = ecb::Encryptor<Aes256>;
type Aes256EcbDec = ecb::Decryptor<Aes256>;

use super::CryptoError;

const BLOCK_SIZE: usize = 16;

fn pkcs7_pad(data: &[u8]) -> Vec<u8> {
    let padding_len = BLOCK_SIZE - (data.len() % BLOCK_SIZE);
    let mut padded = Vec::with_capacity(data.len() + padding_len);
    padded.extend_from_slice(data);
    padded.resize(padded.len() + padding_len, padding_len as u8);
    padded
}

fn pkcs7_unpad(data: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if data.is_empty() {
        return Err(CryptoError::AesError("Empty data for unpadding".into()));
    }
    let pad_len = *data.last().unwrap() as usize;
    if pad_len == 0 || pad_len > BLOCK_SIZE || pad_len > data.len() {
        return Err(CryptoError::AesError("Invalid PKCS7 padding".into()));
    }
    for &byte in &data[data.len() - pad_len..] {
        if byte != pad_len as u8 {
            return Err(CryptoError::AesError("Invalid PKCS7 padding bytes".into()));
        }
    }
    Ok(data[..data.len() - pad_len].to_vec())
}

// ---------------------------------------------------------------------------
// AES-128-ECB  (OCS message encryption compatible)
//
// CryptoJS with a 16-byte WordArray key uses AES-128 in ECB mode with PKCS7.
// The low-level functions here accept raw byte slices and normalise the key
// to exactly 16 bytes (zero-padded or truncated).
// ---------------------------------------------------------------------------

/// AES-128-ECB encrypt with PKCS7 padding.
/// Key is normalised to 16 bytes (truncated or zero-padded).
pub fn encrypt_ecb_128(plaintext: &[u8], key: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let key = normalize_key_128(key);
    let mut buf = pkcs7_pad(plaintext);

    let enc =
        Aes128EcbEnc::new_from_slice(&key).map_err(|e| CryptoError::AesError(e.to_string()))?;

    for chunk in buf.chunks_mut(BLOCK_SIZE) {
        let block = aes::Block::from_mut_slice(chunk);
        enc.clone().encrypt_block_mut(block);
    }
    Ok(buf)
}

/// AES-128-ECB decrypt with PKCS7 unpadding.
/// Key is normalised to 16 bytes (truncated or zero-padded).
pub fn decrypt_ecb_128(ciphertext: &[u8], key: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if ciphertext.is_empty() || ciphertext.len() % BLOCK_SIZE != 0 {
        return Err(CryptoError::AesError("Invalid ciphertext length".into()));
    }

    let key = normalize_key_128(key);
    let dec =
        Aes128EcbDec::new_from_slice(&key).map_err(|e| CryptoError::AesError(e.to_string()))?;

    let mut buf = ciphertext.to_vec();
    for chunk in buf.chunks_mut(BLOCK_SIZE) {
        let block = aes::Block::from_mut_slice(chunk);
        dec.clone().decrypt_block_mut(block);
    }

    pkcs7_unpad(&buf)
}

/// AES-128-ECB decrypt without PKCS7 unpadding.
/// Used only for file-format probing where the padding block itself must be inspected.
pub fn decrypt_ecb_128_no_padding(ciphertext: &[u8], key: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if ciphertext.is_empty() || ciphertext.len() % BLOCK_SIZE != 0 {
        return Err(CryptoError::AesError("Invalid ciphertext length".into()));
    }

    let key = normalize_key_128(key);
    let dec =
        Aes128EcbDec::new_from_slice(&key).map_err(|e| CryptoError::AesError(e.to_string()))?;

    let mut buf = ciphertext.to_vec();
    for chunk in buf.chunks_mut(BLOCK_SIZE) {
        let block = aes::Block::from_mut_slice(chunk);
        dec.clone().decrypt_block_mut(block);
    }
    Ok(buf)
}

/// AES-128-ECB encrypt returning a hex-encoded string.
pub fn encrypt_ecb_128_hex(plaintext: &str, key: &[u8]) -> Result<String, CryptoError> {
    let encrypted = encrypt_ecb_128(plaintext.as_bytes(), key)?;
    Ok(hex::encode(encrypted))
}

/// AES-128-ECB decrypt from a hex-encoded ciphertext string.
pub fn decrypt_ecb_128_hex(hex_ciphertext: &str, key: &[u8]) -> Result<String, CryptoError> {
    let ciphertext =
        hex::decode(hex_ciphertext).map_err(|e| CryptoError::AesError(e.to_string()))?;
    let decrypted = decrypt_ecb_128(&ciphertext, key)?;
    String::from_utf8(decrypted).map_err(|e| CryptoError::AesError(e.to_string()))
}

// ---------------------------------------------------------------------------
// AES-256-ECB  (kept for any 256-bit use cases)
// ---------------------------------------------------------------------------

/// AES-256-ECB encrypt with PKCS7 padding.
/// Key is normalised to 32 bytes (truncated or zero-padded).
pub fn encrypt_ecb_256(plaintext: &[u8], key: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let key = normalize_key_256(key);
    let mut buf = pkcs7_pad(plaintext);

    let enc =
        Aes256EcbEnc::new_from_slice(&key).map_err(|e| CryptoError::AesError(e.to_string()))?;

    for chunk in buf.chunks_mut(BLOCK_SIZE) {
        let block = aes::Block::from_mut_slice(chunk);
        enc.clone().encrypt_block_mut(block);
    }
    Ok(buf)
}

/// AES-256-ECB decrypt with PKCS7 unpadding.
/// Key is normalised to 32 bytes (truncated or zero-padded).
pub fn decrypt_ecb_256(ciphertext: &[u8], key: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if ciphertext.is_empty() || ciphertext.len() % BLOCK_SIZE != 0 {
        return Err(CryptoError::AesError("Invalid ciphertext length".into()));
    }

    let key = normalize_key_256(key);
    let dec =
        Aes256EcbDec::new_from_slice(&key).map_err(|e| CryptoError::AesError(e.to_string()))?;

    let mut buf = ciphertext.to_vec();
    for chunk in buf.chunks_mut(BLOCK_SIZE) {
        let block = aes::Block::from_mut_slice(chunk);
        dec.clone().decrypt_block_mut(block);
    }

    pkcs7_unpad(&buf)
}

/// AES-256-ECB encrypt returning a hex-encoded string.
pub fn encrypt_ecb_256_hex(plaintext: &str, key: &[u8]) -> Result<String, CryptoError> {
    let encrypted = encrypt_ecb_256(plaintext.as_bytes(), key)?;
    Ok(hex::encode(encrypted))
}

/// AES-256-ECB decrypt from a hex-encoded ciphertext string.
pub fn decrypt_ecb_256_hex(hex_ciphertext: &str, key: &[u8]) -> Result<String, CryptoError> {
    let ciphertext =
        hex::decode(hex_ciphertext).map_err(|e| CryptoError::AesError(e.to_string()))?;
    let decrypted = decrypt_ecb_256(&ciphertext, key)?;
    String::from_utf8(decrypted).map_err(|e| CryptoError::AesError(e.to_string()))
}

// ---------------------------------------------------------------------------
// High-level: transport encryption  (socket / API frames)
//
// Mirrors OCS `_encrypt` (encrypt) / `_decrypt2` (decrypt).
// The full key string is converted to UTF-8 bytes and passed directly to
// AES-128-ECB.  normalize_key_128 takes the first 16 bytes if longer.
// ---------------------------------------------------------------------------

/// Encrypt for socket/API transport.
/// Full key string → UTF-8 bytes → AES-128-ECB with PKCS7 padding.
pub fn encrypt_transport(plaintext: &[u8], key: &str) -> Result<Vec<u8>, CryptoError> {
    encrypt_ecb_128(plaintext, key.as_bytes())
}

/// Decrypt from socket/API transport.
/// Full key string → UTF-8 bytes → AES-128-ECB with PKCS7 unpadding.
pub fn decrypt_transport(ciphertext: &[u8], key: &str) -> Result<Vec<u8>, CryptoError> {
    decrypt_ecb_128(ciphertext, key.as_bytes())
}

// ---------------------------------------------------------------------------
// High-level: message content encryption
//
// Mirrors OCS `_encrypt2` (encrypt) / `_decrypt` (decrypt).
// Takes the first 16 *characters* (Unicode code-points) of the key string,
// converts to UTF-8 bytes, and uses those as the AES-128-ECB key.
// For ASCII keys the character / byte distinction is irrelevant.
// ---------------------------------------------------------------------------

/// Encrypt message content.
/// First 16 chars of key → UTF-8 bytes → AES-128-ECB with PKCS7 padding.
pub fn encrypt_message(plaintext: &[u8], key: &str) -> Result<Vec<u8>, CryptoError> {
    let truncated: String = key.chars().take(16).collect();
    encrypt_ecb_128(plaintext, truncated.as_bytes())
}

/// Decrypt message content.
/// First 16 chars of key → UTF-8 bytes → AES-128-ECB with PKCS7 unpadding.
pub fn decrypt_message(ciphertext: &[u8], key: &str) -> Result<Vec<u8>, CryptoError> {
    let truncated: String = key.chars().take(16).collect();
    decrypt_ecb_128(ciphertext, truncated.as_bytes())
}

// ---------------------------------------------------------------------------
// Key normalisation helpers
// ---------------------------------------------------------------------------

fn normalize_key_128(key: &[u8]) -> [u8; 16] {
    let mut out = [0u8; 16];
    let len = key.len().min(16);
    out[..len].copy_from_slice(&key[..len]);
    out
}

fn normalize_key_256(key: &[u8]) -> [u8; 32] {
    let mut out = [0u8; 32];
    let len = key.len().min(32);
    out[..len].copy_from_slice(&key[..len]);
    out
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- AES-128-ECB ---------------------------------------------------------

    #[test]
    fn roundtrip_128() {
        let key = b"0123456789abcdef";
        let pt = b"Hello, OCS Chat!";
        let ct = encrypt_ecb_128(pt, key).unwrap();
        assert_eq!(decrypt_ecb_128(&ct, key).unwrap(), pt);
    }

    #[test]
    fn key_truncation_128() {
        let long = b"0123456789abcdefGHIJKLMNOPQRSTUV";
        let short = b"0123456789abcdef";
        let pt = b"Truncation test";
        assert_eq!(
            encrypt_ecb_128(pt, long).unwrap(),
            encrypt_ecb_128(pt, short).unwrap(),
            "AES-128 must only use first 16 bytes of key"
        );
    }

    #[test]
    fn block_aligned_plaintext_128() {
        let key = b"0123456789abcdef";
        let pt = b"0123456789abcdef"; // exactly 16 bytes
        let ct = encrypt_ecb_128(pt, key).unwrap();
        assert_eq!(ct.len(), 32, "PKCS7 adds full 16-byte block when aligned");
        assert_eq!(decrypt_ecb_128(&ct, key).unwrap(), pt);
    }

    #[test]
    fn empty_plaintext_128() {
        let key = b"0123456789abcdef";
        let ct = encrypt_ecb_128(b"", key).unwrap();
        assert_eq!(ct.len(), 16);
        assert!(decrypt_ecb_128(&ct, key).unwrap().is_empty());
    }

    #[test]
    fn hex_roundtrip_128() {
        let key = b"0123456789abcdef";
        let pt = "Test hex 128 message";
        let hex_ct = encrypt_ecb_128_hex(pt, key).unwrap();
        assert_eq!(decrypt_ecb_128_hex(&hex_ct, key).unwrap(), pt);
    }

    #[test]
    fn short_key_zero_padded_128() {
        let key = b"short";
        let pt = b"pad test";
        let ct = encrypt_ecb_128(pt, key).unwrap();
        assert_eq!(decrypt_ecb_128(&ct, key).unwrap(), pt);
    }

    // -- AES-256-ECB ---------------------------------------------------------

    #[test]
    fn roundtrip_256() {
        let key = b"0123456789abcdef0123456789abcdef";
        let pt = b"Hello, OCS Chat!";
        let ct = encrypt_ecb_256(pt, key).unwrap();
        assert_eq!(decrypt_ecb_256(&ct, key).unwrap(), pt);
    }

    #[test]
    fn hex_roundtrip_256() {
        let key = b"0123456789abcdef0123456789abcdef";
        let pt = "Test message";
        let hex_ct = encrypt_ecb_256_hex(pt, key).unwrap();
        assert_eq!(decrypt_ecb_256_hex(&hex_ct, key).unwrap(), pt);
    }

    #[test]
    fn differs_128_vs_256() {
        let key = b"0123456789abcdef0123456789abcdef";
        let pt = b"AES size test";
        assert_ne!(
            encrypt_ecb_128(pt, key).unwrap(),
            encrypt_ecb_256(pt, key).unwrap(),
            "AES-128 and AES-256 must produce different ciphertext"
        );
    }

    // -- Message encryption --------------------------------------------------

    #[test]
    fn message_roundtrip() {
        let key = "abcdefghijklmnopqrstuvwxyz";
        let pt = b"Secret message content";
        let ct = encrypt_message(pt, key).unwrap();
        assert_eq!(decrypt_message(&ct, key).unwrap(), pt);
    }

    #[test]
    fn message_uses_first_16_chars() {
        let k1 = "0123456789abcdefXXXX";
        let k2 = "0123456789abcdefYYYY";
        let pt = b"Same first 16 chars";
        assert_eq!(
            encrypt_message(pt, k1).unwrap(),
            encrypt_message(pt, k2).unwrap(),
            "Message encryption must only use first 16 chars"
        );
    }

    #[test]
    fn message_short_key() {
        let key = "abc";
        let pt = b"short key msg";
        let ct = encrypt_message(pt, key).unwrap();
        assert_eq!(decrypt_message(&ct, key).unwrap(), pt);
    }

    // -- Transport encryption ------------------------------------------------

    #[test]
    fn transport_roundtrip() {
        let key = "transport_key_16";
        let pt = b"Transport payload data";
        let ct = encrypt_transport(pt, key).unwrap();
        assert_eq!(decrypt_transport(&ct, key).unwrap(), pt);
    }

    #[test]
    fn transport_uses_full_key_bytes() {
        let k1 = "0123456789abcdef";
        let k2 = "0123456789abcdefEXTRA";
        let pt = b"Full key test";
        assert_eq!(
            encrypt_transport(pt, k1).unwrap(),
            encrypt_transport(pt, k2).unwrap(),
            "Both keys share the same first 16 UTF-8 bytes"
        );
    }

    #[test]
    fn message_and_transport_same_for_16char_ascii_key() {
        let key = "0123456789abcdef";
        let pt = b"Same key test";
        assert_eq!(
            encrypt_message(pt, key).unwrap(),
            encrypt_transport(pt, key).unwrap()
        );
    }

    // -- Error cases ---------------------------------------------------------

    #[test]
    fn invalid_ciphertext_length() {
        assert!(decrypt_ecb_128(&[0u8; 15], b"0123456789abcdef").is_err());
    }

    #[test]
    fn empty_ciphertext() {
        assert!(decrypt_ecb_128(&[], b"0123456789abcdef").is_err());
    }

    #[test]
    fn invalid_padding_byte() {
        let key = b"0123456789abcdef";
        let mut ct = encrypt_ecb_128(b"test", key).unwrap();
        // Corrupt the last byte to break padding validation
        let last = ct.len() - 1;
        ct[last] ^= 0xFF;
        assert!(decrypt_ecb_128(&ct, key).is_err());
    }
}
