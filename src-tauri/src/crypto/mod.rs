pub mod aes;
pub mod curve25519;
pub mod file_crypto;
pub mod rsa_crypto;

use dashmap::DashMap;

pub struct CryptoEngine {
    shared_keys: DashMap<String, Vec<u8>>,
    rsa_private_key: parking_lot::RwLock<Option<Vec<u8>>>,
    rsa_public_key: parking_lot::RwLock<Option<Vec<u8>>>,
}

impl CryptoEngine {
    pub fn new() -> Self {
        Self {
            shared_keys: DashMap::new(),
            rsa_private_key: parking_lot::RwLock::new(None),
            rsa_public_key: parking_lot::RwLock::new(None),
        }
    }

    pub fn set_shared_key(&self, target_id: &str, key: Vec<u8>) {
        self.shared_keys.insert(target_id.to_string(), key);
    }

    pub fn get_shared_key(&self, target_id: &str) -> Option<Vec<u8>> {
        self.shared_keys.get(target_id).map(|v| v.clone())
    }

    pub fn encrypt_message(&self, target_id: &str, plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
        let key = self
            .get_shared_key(target_id)
            .ok_or(CryptoError::KeyNotFound)?;
        aes::encrypt_ecb(plaintext, &key)
    }

    pub fn decrypt_message(&self, target_id: &str, ciphertext: &[u8]) -> Result<Vec<u8>, CryptoError> {
        let key = self
            .get_shared_key(target_id)
            .ok_or(CryptoError::KeyNotFound)?;
        aes::decrypt_ecb(ciphertext, &key)
    }
}

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
}

impl serde::Serialize for CryptoError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
