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
// CryptoJS-compatible AES-ECB decryption for arbitrary key sizes.
//
// CryptoJS derives the AES variant from the *key length*:
//   keySize = key.sigBytes / 4  (number of 32-bit words)
//   nRounds = keySize + 6
// The legacy Electron desktop cache (`abc` file, cacheDB.js) is encrypted with
// a 4-byte ASCII key such as "5554"/"4554"/"9754", which yields keySize = 1 and
// a non-standard 7-round cipher. The standard `aes` crate (AES-128, 10 rounds)
// cannot reproduce this, so we replicate CryptoJS's key schedule + inverse
// cipher directly. For a full 16-byte key this reduces to standard AES-128.
// ---------------------------------------------------------------------------

const AES_SBOX: [u8; 256] = [
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
];

// CryptoJS RCON table. Indices beyond 10 are `undefined` in JS => treated as 0.
const CRYPTOJS_RCON: [u32; 11] = [
    0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36,
];

fn aes_inv_sbox() -> [u8; 256] {
    let mut inv = [0u8; 256];
    for (i, &s) in AES_SBOX.iter().enumerate() {
        inv[s as usize] = i as u8;
    }
    inv
}

fn aes_sub_word(t: u32) -> u32 {
    ((AES_SBOX[((t >> 24) & 0xff) as usize] as u32) << 24)
        | ((AES_SBOX[((t >> 16) & 0xff) as usize] as u32) << 16)
        | ((AES_SBOX[((t >> 8) & 0xff) as usize] as u32) << 8)
        | (AES_SBOX[(t & 0xff) as usize] as u32)
}

/// Replicate CryptoJS's AES key expansion for an arbitrary key length.
/// Returns the expanded key schedule (`(nRounds + 1) * 4` words) and `nRounds`.
fn cryptojs_key_expansion(key: &[u8]) -> (Vec<u32>, usize) {
    let key_size = key.len().div_ceil(4).max(1);
    let mut key_words = vec![0u32; key_size];
    for (i, word) in key_words.iter_mut().enumerate() {
        let b0 = *key.get(i * 4).unwrap_or(&0) as u32;
        let b1 = *key.get(i * 4 + 1).unwrap_or(&0) as u32;
        let b2 = *key.get(i * 4 + 2).unwrap_or(&0) as u32;
        let b3 = *key.get(i * 4 + 3).unwrap_or(&0) as u32;
        *word = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
    }

    let n_rounds = key_size + 6;
    let ks_rows = (n_rounds + 1) * 4;
    let mut ks = vec![0u32; ks_rows];
    for ks_row in 0..ks_rows {
        if ks_row < key_size {
            ks[ks_row] = key_words[ks_row];
            continue;
        }

        let mut t = ks[ks_row - 1];
        if ks_row % key_size == 0 {
            t = (t << 8) | (t >> 24);
            t = aes_sub_word(t);
            let rcon = CRYPTOJS_RCON
                .get(ks_row / key_size)
                .copied()
                .unwrap_or(0);
            t ^= rcon << 24;
        } else if key_size > 6 && ks_row % key_size == 4 {
            t = aes_sub_word(t);
        }
        ks[ks_row] = ks[ks_row - key_size] ^ t;
    }

    (ks, n_rounds)
}

fn gf_mul(mut a: u8, mut b: u8) -> u8 {
    let mut p = 0u8;
    for _ in 0..8 {
        if b & 1 != 0 {
            p ^= a;
        }
        let hi = a & 0x80;
        a <<= 1;
        if hi != 0 {
            a ^= 0x1b;
        }
        b >>= 1;
    }
    p
}

fn add_round_key(state: &mut [u8; 16], ks: &[u32], round: usize) {
    for c in 0..4 {
        let w = ks[round * 4 + c];
        state[c * 4] ^= (w >> 24) as u8;
        state[c * 4 + 1] ^= (w >> 16) as u8;
        state[c * 4 + 2] ^= (w >> 8) as u8;
        state[c * 4 + 3] ^= w as u8;
    }
}

fn inv_shift_rows(state: &mut [u8; 16]) {
    for r in 1..4 {
        let row = [
            state[r],
            state[4 + r],
            state[8 + r],
            state[12 + r],
        ];
        for c in 0..4 {
            state[c * 4 + r] = row[(c + 4 - r) % 4];
        }
    }
}

fn inv_sub_bytes(state: &mut [u8; 16], inv_sbox: &[u8; 256]) {
    for byte in state.iter_mut() {
        *byte = inv_sbox[*byte as usize];
    }
}

fn inv_mix_columns(state: &mut [u8; 16]) {
    for c in 0..4 {
        let a0 = state[c * 4];
        let a1 = state[c * 4 + 1];
        let a2 = state[c * 4 + 2];
        let a3 = state[c * 4 + 3];
        state[c * 4] = gf_mul(a0, 14) ^ gf_mul(a1, 11) ^ gf_mul(a2, 13) ^ gf_mul(a3, 9);
        state[c * 4 + 1] = gf_mul(a0, 9) ^ gf_mul(a1, 14) ^ gf_mul(a2, 11) ^ gf_mul(a3, 13);
        state[c * 4 + 2] = gf_mul(a0, 13) ^ gf_mul(a1, 9) ^ gf_mul(a2, 14) ^ gf_mul(a3, 11);
        state[c * 4 + 3] = gf_mul(a0, 11) ^ gf_mul(a1, 13) ^ gf_mul(a2, 9) ^ gf_mul(a3, 14);
    }
}

fn cryptojs_decrypt_block(
    block: &[u8],
    ks: &[u32],
    n_rounds: usize,
    inv_sbox: &[u8; 256],
) -> [u8; 16] {
    let mut state = [0u8; 16];
    state.copy_from_slice(&block[..16]);

    add_round_key(&mut state, ks, n_rounds);
    for round in (1..n_rounds).rev() {
        inv_shift_rows(&mut state);
        inv_sub_bytes(&mut state, inv_sbox);
        add_round_key(&mut state, ks, round);
        inv_mix_columns(&mut state);
    }
    inv_shift_rows(&mut state);
    inv_sub_bytes(&mut state, inv_sbox);
    add_round_key(&mut state, ks, 0);
    state
}

/// AES-ECB decrypt with PKCS7 unpadding, compatible with CryptoJS for any key
/// length (including short keys that produce a non-standard round count).
pub fn decrypt_cryptojs_ecb(ciphertext: &[u8], key: &str) -> Result<Vec<u8>, CryptoError> {
    if ciphertext.is_empty() || ciphertext.len() % BLOCK_SIZE != 0 {
        return Err(CryptoError::AesError("Invalid ciphertext length".into()));
    }

    let (ks, n_rounds) = cryptojs_key_expansion(key.as_bytes());
    let inv_sbox = aes_inv_sbox();

    let mut out = Vec::with_capacity(ciphertext.len());
    for chunk in ciphertext.chunks(BLOCK_SIZE) {
        let block = cryptojs_decrypt_block(chunk, &ks, n_rounds, &inv_sbox);
        out.extend_from_slice(&block);
    }

    pkcs7_unpad(&out)
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

    // -- CryptoJS-compatible short-key decryption --------------------------

    // Test vectors generated from the legacy project's crypto-js.min.js using
    // the worker `_encrypt` path (AES-ECB, PKCS7, UTF-8 key parsed as-is).
    const CRYPTOJS_PLAIN: &str = "{\"uid\":\"894508\",\"history\":[{\"name\":\"894508-message.man123\",\"list\":[{\"sendTime\":1781593843158,\"content\":\"hi\"}]}]}";

    fn assert_cryptojs_vector(key: &str, hex_ct: &str) {
        let ct = hex::decode(hex_ct).expect("hex");
        let pt = decrypt_cryptojs_ecb(&ct, key).expect("decrypt");
        assert_eq!(String::from_utf8(pt).unwrap(), CRYPTOJS_PLAIN);
    }

    #[test]
    fn cryptojs_short_key_5554() {
        assert_cryptojs_vector(
            "5554",
            "983b24969f3323093cd29dc3832dc82be8e672e7e79cb2483def0fa8aa4812b3c69d257159144d9e8822adcc545bf160f6396156d5fdd001438de8ec584de96c384d7a4931c4dc0c3bcb2d6729df37e18aaada5d0b1511bafac7908f6dfd48b7fda805d3f2626724fe4f49fad76cdaabc81465eb7e5facc4d8f3f286c92904dc",
        );
    }

    #[test]
    fn cryptojs_short_key_4554() {
        assert_cryptojs_vector(
            "4554",
            "847dc2cd39ca0d2f8d304712a269b2321ad96000dec9d1712ad875353c955c7e958abf42071ebfc8329626be3007a5e5f0440cdaf3d22138f2adc6f58d923aa22e3636e974361e8626af81887ff3f3f698137cc09b51763fa69777f1480f4cdeff2203b3169924ca882c149284b44ca27724b8daf766067a586fbac2d04bce36",
        );
    }

    #[test]
    fn cryptojs_short_key_9754() {
        assert_cryptojs_vector(
            "9754",
            "5ba0969db5e0a41f84759932fb24bb7555a8ce4374ea2203e6b7bea8d949f9d3500012085095cfaadba0d7775241f75edd9898d1dd3e50f730f7a030c40167a515a23662268084e84b13b78b0499d52314d15c2ac1bab25d0c74c03d5cb1cdd7b96bb8be31c8f709c9be9a3d364b7feaea80cff2b8d16f949501a3e002c9f578",
        );
    }

    #[test]
    fn cryptojs_full_key_matches_standard_aes128() {
        // A 16-byte key must behave exactly like standard AES-128.
        let key = "0123456789abcdef";
        let pt = b"CryptoJS AES 128";
        let ct = encrypt_ecb_128(pt, key.as_bytes()).unwrap();
        let dec = decrypt_cryptojs_ecb(&ct, key).unwrap();
        assert_eq!(dec, pt);
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
