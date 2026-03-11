pub mod aes;
pub mod curve25519;
pub mod file_crypto;
pub mod rsa_crypto;

use dashmap::DashMap;
use parking_lot::RwLock;
use tracing::debug;

// ---------------------------------------------------------------------------
// Key entry types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct FriendKeyEntry {
    pub rel_key: String,
    pub version: i64,
    /// `"app"` or `"web"`
    pub source: String,
}

// ---------------------------------------------------------------------------
// CryptoEngine – manages all encryption keys and provides encrypt / decrypt
// ---------------------------------------------------------------------------

pub struct CryptoEngine {
    /// Friend keys keyed by `"{friend_id}:{version}:{source}"`
    friend_keys: DashMap<String, FriendKeyEntry>,
    /// Group keys keyed by group_id → relKey
    group_keys: DashMap<String, String>,
    /// Channel keys keyed by channel_id → relKey
    channel_keys: DashMap<String, String>,

    rsa_private_key: RwLock<Option<String>>,
    rsa_public_key: RwLock<Option<String>>,
    /// Curve25519 private key (hex-encoded)
    curve_private_key: RwLock<Option<String>>,
}

impl Default for CryptoEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl CryptoEngine {
    pub fn new() -> Self {
        Self {
            friend_keys: DashMap::new(),
            group_keys: DashMap::new(),
            channel_keys: DashMap::new(),
            rsa_private_key: RwLock::new(None),
            rsa_public_key: RwLock::new(None),
            curve_private_key: RwLock::new(None),
        }
    }

    // -----------------------------------------------------------------------
    // RSA key management
    // -----------------------------------------------------------------------

    pub fn set_rsa_keys(&self, private_pem: String, public_pem: String) {
        *self.rsa_private_key.write() = Some(private_pem);
        *self.rsa_public_key.write() = Some(public_pem);
    }

    pub fn get_rsa_private_key(&self) -> Option<String> {
        self.rsa_private_key.read().clone()
    }

    pub fn get_rsa_public_key(&self) -> Option<String> {
        self.rsa_public_key.read().clone()
    }

    // -----------------------------------------------------------------------
    // Curve25519 key management
    // -----------------------------------------------------------------------

    pub fn set_curve_private_key(&self, hex_key: String) {
        *self.curve_private_key.write() = Some(hex_key);
    }

    pub fn get_curve_private_key(&self) -> Option<String> {
        self.curve_private_key.read().clone()
    }

    // -----------------------------------------------------------------------
    // Friend key management  (per friend_id + version + source)
    // -----------------------------------------------------------------------

    fn friend_cache_key(friend_id: &str, version: i64, source: &str) -> String {
        format!("{}:{}:{}", friend_id, version, source)
    }

    pub fn set_friend_key(
        &self,
        friend_id: &str,
        version: i64,
        source: &str,
        rel_key: String,
    ) {
        let k = Self::friend_cache_key(friend_id, version, source);
        self.friend_keys.insert(
            k,
            FriendKeyEntry {
                rel_key,
                version,
                source: source.to_string(),
            },
        );
    }

    pub fn get_friend_key(&self, friend_id: &str, version: i64, source: &str) -> Option<String> {
        let k = Self::friend_cache_key(friend_id, version, source);
        self.friend_keys.get(&k).map(|e| e.rel_key.clone())
    }

    pub fn remove_friend_keys(&self, friend_id: &str) {
        let prefix = format!("{}:", friend_id);
        self.friend_keys.retain(|k, _| !k.starts_with(&prefix));
    }

    // -----------------------------------------------------------------------
    // Group key management  (per group_id)
    // -----------------------------------------------------------------------

    pub fn set_group_key(&self, group_id: &str, rel_key: String) {
        self.group_keys.insert(group_id.to_string(), rel_key);
    }

    pub fn get_group_key(&self, group_id: &str) -> Option<String> {
        self.group_keys.get(group_id).map(|v| v.clone())
    }

    pub fn remove_group_key(&self, group_id: &str) {
        self.group_keys.remove(group_id);
    }

    // -----------------------------------------------------------------------
    // Channel key management  (per channel_id)
    // -----------------------------------------------------------------------

    pub fn set_channel_key(&self, channel_id: &str, rel_key: String) {
        self.channel_keys.insert(channel_id.to_string(), rel_key);
    }

    pub fn get_channel_key(&self, channel_id: &str) -> Option<String> {
        self.channel_keys.get(channel_id).map(|v| v.clone())
    }

    pub fn remove_channel_key(&self, channel_id: &str) {
        self.channel_keys.remove(channel_id);
    }

    // -----------------------------------------------------------------------
    // Key derivation
    //
    // shared_secret = Curve25519(private_key, peer_public_key)
    // shared_hex    = UPPERCASE hex of shared_secret
    // msgKey        = AES-128-ECB decrypt(encrypted_msgKey, shared_hex bytes)
    // protobuf      = [0x0A][varint_len][actual_key]
    // relKey        = UTF-8 string of actual_key, trimmed
    // -----------------------------------------------------------------------

    /// Derive a relKey using the engine's stored Curve25519 private key.
    pub fn derive_rel_key(
        &self,
        peer_public_key_hex: &str,
        encrypted_msg_key: &[u8],
    ) -> Result<String, CryptoError> {
        let private_key = self
            .get_curve_private_key()
            .ok_or(CryptoError::KeyNotFound)?;

        Self::derive_rel_key_with_private(&private_key, peer_public_key_hex, encrypted_msg_key)
    }

    /// Derive a relKey given an explicit Curve25519 private key (hex).
    pub fn derive_rel_key_with_private(
        private_key_hex: &str,
        peer_public_key_hex: &str,
        encrypted_msg_key: &[u8],
    ) -> Result<String, CryptoError> {
        let shared_secret =
            curve25519::compute_shared_secret(private_key_hex, peer_public_key_hex)?;
        let shared_hex = hex::encode_upper(&shared_secret);

        let msg_key_bytes = aes::decrypt_ecb_128(encrypted_msg_key, shared_hex.as_bytes())?;
        let rel_key_bytes = parse_protobuf_key(&msg_key_bytes)?;

        String::from_utf8(rel_key_bytes)
            .map(|s| s.trim().to_string())
            .map_err(|e| CryptoError::AesError(format!("Invalid UTF-8 in relKey: {}", e)))
    }

    // -----------------------------------------------------------------------
    // Derive-and-cache helpers for friends / groups / channels
    // -----------------------------------------------------------------------

    /// Derive a friend relKey from Curve25519 DH, cache it, and return.
    /// Returns the cached value immediately if already derived.
    pub fn derive_friend_key(
        &self,
        friend_id: &str,
        version: i64,
        source: &str,
        friend_public_key_hex: &str,
        encrypted_msg_key: &[u8],
    ) -> Result<String, CryptoError> {
        if let Some(cached) = self.get_friend_key(friend_id, version, source) {
            return Ok(cached);
        }

        let rel_key = self.derive_rel_key(friend_public_key_hex, encrypted_msg_key)?;
        self.set_friend_key(friend_id, version, source, rel_key.clone());
        debug!(
            "Derived friend key for {}:{}:{}",
            friend_id, version, source
        );
        Ok(rel_key)
    }

    /// Derive a group relKey from Curve25519 DH, cache it, and return.
    pub fn derive_group_key(
        &self,
        group_id: &str,
        group_public_key_hex: &str,
        encrypted_msg_key: &[u8],
    ) -> Result<String, CryptoError> {
        if let Some(cached) = self.get_group_key(group_id) {
            return Ok(cached);
        }

        let rel_key = self.derive_rel_key(group_public_key_hex, encrypted_msg_key)?;
        self.set_group_key(group_id, rel_key.clone());
        debug!("Derived group key for {}", group_id);
        Ok(rel_key)
    }

    /// Derive a channel relKey from Curve25519 DH, cache it, and return.
    pub fn derive_channel_key(
        &self,
        channel_id: &str,
        channel_public_key_hex: &str,
        encrypted_msg_key: &[u8],
    ) -> Result<String, CryptoError> {
        if let Some(cached) = self.get_channel_key(channel_id) {
            return Ok(cached);
        }

        let rel_key = self.derive_rel_key(channel_public_key_hex, encrypted_msg_key)?;
        self.set_channel_key(channel_id, rel_key.clone());
        debug!("Derived channel key for {}", channel_id);
        Ok(rel_key)
    }

    // -----------------------------------------------------------------------
    // Convenience encrypt / decrypt wrappers  (message-level AES-128-ECB)
    // -----------------------------------------------------------------------

    pub fn encrypt_friend_message(
        &self,
        friend_id: &str,
        version: i64,
        source: &str,
        plaintext: &[u8],
    ) -> Result<Vec<u8>, CryptoError> {
        let key = self
            .get_friend_key(friend_id, version, source)
            .ok_or(CryptoError::KeyNotFound)?;
        aes::encrypt_message(plaintext, &key)
    }

    pub fn decrypt_friend_message(
        &self,
        friend_id: &str,
        version: i64,
        source: &str,
        ciphertext: &[u8],
    ) -> Result<Vec<u8>, CryptoError> {
        let key = self
            .get_friend_key(friend_id, version, source)
            .ok_or(CryptoError::KeyNotFound)?;
        aes::decrypt_message(ciphertext, &key)
    }

    pub fn encrypt_group_message(
        &self,
        group_id: &str,
        plaintext: &[u8],
    ) -> Result<Vec<u8>, CryptoError> {
        let key = self
            .get_group_key(group_id)
            .ok_or(CryptoError::KeyNotFound)?;
        aes::encrypt_message(plaintext, &key)
    }

    pub fn decrypt_group_message(
        &self,
        group_id: &str,
        ciphertext: &[u8],
    ) -> Result<Vec<u8>, CryptoError> {
        let key = self
            .get_group_key(group_id)
            .ok_or(CryptoError::KeyNotFound)?;
        aes::decrypt_message(ciphertext, &key)
    }

    pub fn encrypt_channel_message(
        &self,
        channel_id: &str,
        plaintext: &[u8],
    ) -> Result<Vec<u8>, CryptoError> {
        let key = self
            .get_channel_key(channel_id)
            .ok_or(CryptoError::KeyNotFound)?;
        aes::encrypt_message(plaintext, &key)
    }

    pub fn decrypt_channel_message(
        &self,
        channel_id: &str,
        ciphertext: &[u8],
    ) -> Result<Vec<u8>, CryptoError> {
        let key = self
            .get_channel_key(channel_id)
            .ok_or(CryptoError::KeyNotFound)?;
        aes::decrypt_message(ciphertext, &key)
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    /// Clear every cached key (e.g. on logout).
    pub fn clear_all(&self) {
        self.friend_keys.clear();
        self.group_keys.clear();
        self.channel_keys.clear();
        *self.rsa_private_key.write() = None;
        *self.rsa_public_key.write() = None;
        *self.curve_private_key.write() = None;
    }
}

// ---------------------------------------------------------------------------
// Protobuf key parsing:  [0x0A][varint_len][key_bytes]
// ---------------------------------------------------------------------------

fn parse_protobuf_key(data: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if data.len() < 2 {
        return Err(CryptoError::AesError(
            "Protobuf key data too short".into(),
        ));
    }
    if data[0] != 0x0A {
        return Err(CryptoError::AesError(format!(
            "Expected protobuf field tag 0x0A, got 0x{:02X}",
            data[0]
        )));
    }

    let (len, offset) = decode_varint(&data[1..])?;
    let start = 1 + offset;
    if data.len() < start + len {
        return Err(CryptoError::AesError(format!(
            "Protobuf key truncated: need {} bytes, have {}",
            len,
            data.len() - start
        )));
    }
    Ok(data[start..start + len].to_vec())
}

fn decode_varint(data: &[u8]) -> Result<(usize, usize), CryptoError> {
    let mut result: usize = 0;
    let mut shift = 0;
    for (i, &byte) in data.iter().enumerate() {
        result |= ((byte & 0x7F) as usize) << shift;
        if byte & 0x80 == 0 {
            return Ok((result, i + 1));
        }
        shift += 7;
        if shift >= 64 {
            return Err(CryptoError::AesError("Varint too long".into()));
        }
    }
    Err(CryptoError::AesError("Unexpected end of varint".into()))
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("Key not found for target")]
    KeyNotFound,
    #[error("AES encryption error: {0}")]
    AesError(String),
    #[error("RSA error: {0}")]
    RsaError(String),
    #[error("Curve25519 error: {0}")]
    CurveError(String),
    #[error("File I/O error: {0}")]
    IoError(String),
}

impl serde::Serialize for CryptoError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Protobuf parsing ----------------------------------------------------

    #[test]
    fn parse_protobuf_key_simple() {
        let data = [0x0A, 0x05, b'h', b'e', b'l', b'l', b'o'];
        assert_eq!(parse_protobuf_key(&data).unwrap(), b"hello");
    }

    #[test]
    fn parse_protobuf_key_trailing_data() {
        let mut data = vec![0x0A, 0x03, b'k', b'e', b'y'];
        data.extend_from_slice(b"\x00\x00\x00");
        assert_eq!(parse_protobuf_key(&data).unwrap(), b"key");
    }

    #[test]
    fn parse_protobuf_key_invalid_tag() {
        assert!(parse_protobuf_key(&[0x12, 0x03, b'k', b'e', b'y']).is_err());
    }

    #[test]
    fn parse_protobuf_key_truncated() {
        assert!(parse_protobuf_key(&[0x0A, 0x05, b'h', b'i']).is_err());
    }

    #[test]
    fn parse_protobuf_key_too_short() {
        assert!(parse_protobuf_key(&[0x0A]).is_err());
        assert!(parse_protobuf_key(&[]).is_err());
    }

    // -- Varint --------------------------------------------------------------

    #[test]
    fn decode_varint_single_byte() {
        let (val, len) = decode_varint(&[42]).unwrap();
        assert_eq!((val, len), (42, 1));
    }

    #[test]
    fn decode_varint_two_bytes() {
        let (val, len) = decode_varint(&[0xAC, 0x02]).unwrap();
        assert_eq!((val, len), (300, 2));
    }

    #[test]
    fn decode_varint_empty() {
        assert!(decode_varint(&[]).is_err());
    }

    // -- CryptoEngine: friend keys -------------------------------------------

    #[test]
    fn friend_key_lifecycle() {
        let e = CryptoEngine::new();

        assert!(e.get_friend_key("f1", 1, "app").is_none());

        e.set_friend_key("f1", 1, "app", "secret_key_abcd".into());
        assert_eq!(e.get_friend_key("f1", 1, "app").unwrap(), "secret_key_abcd");

        assert!(e.get_friend_key("f1", 2, "app").is_none());
        assert!(e.get_friend_key("f1", 1, "web").is_none());

        e.set_friend_key("f1", 2, "app", "v2_key".into());
        assert_eq!(e.get_friend_key("f1", 2, "app").unwrap(), "v2_key");

        e.remove_friend_keys("f1");
        assert!(e.get_friend_key("f1", 1, "app").is_none());
        assert!(e.get_friend_key("f1", 2, "app").is_none());
    }

    #[test]
    fn friend_key_multiple_friends() {
        let e = CryptoEngine::new();
        e.set_friend_key("f1", 1, "app", "k1".into());
        e.set_friend_key("f2", 1, "app", "k2".into());

        e.remove_friend_keys("f1");
        assert!(e.get_friend_key("f1", 1, "app").is_none());
        assert_eq!(e.get_friend_key("f2", 1, "app").unwrap(), "k2");
    }

    // -- CryptoEngine: group keys --------------------------------------------

    #[test]
    fn group_key_lifecycle() {
        let e = CryptoEngine::new();
        e.set_group_key("g1", "group_key_1234".into());
        assert_eq!(e.get_group_key("g1").unwrap(), "group_key_1234");

        e.remove_group_key("g1");
        assert!(e.get_group_key("g1").is_none());
    }

    // -- CryptoEngine: channel keys ------------------------------------------

    #[test]
    fn channel_key_lifecycle() {
        let e = CryptoEngine::new();
        e.set_channel_key("c1", "channel_key_5678".into());
        assert_eq!(e.get_channel_key("c1").unwrap(), "channel_key_5678");

        e.remove_channel_key("c1");
        assert!(e.get_channel_key("c1").is_none());
    }

    // -- CryptoEngine: encrypt / decrypt wrappers ----------------------------

    #[test]
    fn encrypt_decrypt_friend_message() {
        let e = CryptoEngine::new();
        e.set_friend_key("f1", 1, "app", "0123456789abcdefGHIJ".into());

        let pt = b"friend msg";
        let ct = e.encrypt_friend_message("f1", 1, "app", pt).unwrap();
        assert_eq!(e.decrypt_friend_message("f1", 1, "app", &ct).unwrap(), pt);
    }

    #[test]
    fn encrypt_decrypt_group_message() {
        let e = CryptoEngine::new();
        e.set_group_key("g1", "0123456789abcdefGHIJ".into());

        let pt = b"group message content";
        let ct = e.encrypt_group_message("g1", pt).unwrap();
        assert_eq!(e.decrypt_group_message("g1", &ct).unwrap(), pt);
    }

    #[test]
    fn encrypt_decrypt_channel_message() {
        let e = CryptoEngine::new();
        e.set_channel_key("c1", "0123456789abcdefGHIJ".into());

        let pt = b"channel message content";
        let ct = e.encrypt_channel_message("c1", pt).unwrap();
        assert_eq!(e.decrypt_channel_message("c1", &ct).unwrap(), pt);
    }

    #[test]
    fn encrypt_missing_key_returns_error() {
        let e = CryptoEngine::new();
        assert!(e.encrypt_friend_message("f1", 1, "app", b"test").is_err());
        assert!(e.encrypt_group_message("g1", b"test").is_err());
        assert!(e.encrypt_channel_message("c1", b"test").is_err());
    }

    // -- CryptoEngine: clear_all ---------------------------------------------

    #[test]
    fn clear_all() {
        let e = CryptoEngine::new();
        e.set_friend_key("f1", 1, "app", "k1".into());
        e.set_group_key("g1", "k2".into());
        e.set_channel_key("c1", "k3".into());
        e.set_curve_private_key("deadbeef".into());
        e.set_rsa_keys("priv".into(), "pub".into());

        e.clear_all();

        assert!(e.get_friend_key("f1", 1, "app").is_none());
        assert!(e.get_group_key("g1").is_none());
        assert!(e.get_channel_key("c1").is_none());
        assert!(e.get_curve_private_key().is_none());
        assert!(e.get_rsa_private_key().is_none());
        assert!(e.get_rsa_public_key().is_none());
    }

    // -- CryptoEngine: Default trait -----------------------------------------

    #[test]
    fn default_trait() {
        let _e: CryptoEngine = Default::default();
    }
}
