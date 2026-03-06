use x25519_dalek::{EphemeralSecret, PublicKey, StaticSecret};
use rand::rngs::OsRng;

use super::CryptoError;

/// Generate a new Curve25519 key pair
pub fn generate_keypair() -> (Vec<u8>, Vec<u8>) {
    let secret = StaticSecret::random_from_rng(OsRng);
    let public = PublicKey::from(&secret);
    (secret.to_bytes().to_vec(), public.as_bytes().to_vec())
}

/// Compute shared secret from our private key and their public key
pub fn compute_shared_secret(
    private_key_hex: &str,
    public_key_hex: &str,
) -> Result<Vec<u8>, CryptoError> {
    let private_bytes = hex::decode(private_key_hex)
        .map_err(|e| CryptoError::CurveError(format!("Invalid private key hex: {}", e)))?;

    let public_bytes = hex::decode(public_key_hex)
        .map_err(|e| CryptoError::CurveError(format!("Invalid public key hex: {}", e)))?;

    if private_bytes.len() != 32 || public_bytes.len() != 32 {
        return Err(CryptoError::CurveError("Key must be 32 bytes".into()));
    }

    let mut priv_arr = [0u8; 32];
    priv_arr.copy_from_slice(&private_bytes);
    let secret = StaticSecret::from(priv_arr);

    let mut pub_arr = [0u8; 32];
    pub_arr.copy_from_slice(&public_bytes);
    let public = PublicKey::from(pub_arr);

    let shared = secret.diffie_hellman(&public);
    Ok(shared.as_bytes().to_vec())
}

/// Generate key pair and return as hex strings
pub fn generate_keypair_hex() -> (String, String) {
    let (private_key, public_key) = generate_keypair();
    (hex::encode(private_key), hex::encode(public_key))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_exchange() {
        let (alice_priv, alice_pub) = generate_keypair_hex();
        let (bob_priv, bob_pub) = generate_keypair_hex();

        let shared_a = compute_shared_secret(&alice_priv, &bob_pub).unwrap();
        let shared_b = compute_shared_secret(&bob_priv, &alice_pub).unwrap();

        assert_eq!(shared_a, shared_b);
    }
}
