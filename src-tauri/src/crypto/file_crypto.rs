use super::{aes, CryptoError};
use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};

/// OCS uses 102 400-byte (100 KiB) plaintext chunks for file encryption.
pub const ENCRYPT_CHUNK_SIZE: usize = 102_400;

/// Each encrypted chunk is 102 416 bytes (plaintext + one 16-byte PKCS7 block).
pub const DECRYPT_CHUNK_SIZE: usize = 102_416;

// ---------------------------------------------------------------------------
// Chunk-level encrypt / decrypt
// ---------------------------------------------------------------------------

/// Encrypt a single file chunk with AES-128-ECB (first 16 chars of key, PKCS7).
/// Input should be at most `ENCRYPT_CHUNK_SIZE` bytes.
pub fn encrypt_file_chunk(chunk: &[u8], key: &str) -> Vec<u8> {
    aes::encrypt_message(chunk, key).expect("encrypt_file_chunk: AES-128-ECB encrypt failed")
}

/// Decrypt a single file chunk with AES-128-ECB (first 16 chars of key, PKCS7).
/// Input should be at most `DECRYPT_CHUNK_SIZE` bytes.
pub fn decrypt_file_chunk(chunk: &[u8], key: &str) -> Vec<u8> {
    aes::decrypt_message(chunk, key).expect("decrypt_file_chunk: AES-128-ECB decrypt failed")
}

// ---------------------------------------------------------------------------
// Stream file encrypt / decrypt
// ---------------------------------------------------------------------------

/// Stream-encrypt a file: reads `ENCRYPT_CHUNK_SIZE` bytes at a time,
/// encrypts each chunk with AES-128-ECB, and writes ciphertext sequentially.
pub fn encrypt_file(input_path: &str, output_path: &str, key: &str) -> Result<(), CryptoError> {
    let input =
        File::open(input_path).map_err(|e| CryptoError::IoError(format!("open input: {}", e)))?;
    let output = File::create(output_path)
        .map_err(|e| CryptoError::IoError(format!("create output: {}", e)))?;

    let mut reader = BufReader::new(input);
    let mut writer = BufWriter::new(output);
    let mut buf = vec![0u8; ENCRYPT_CHUNK_SIZE];

    loop {
        let n = read_fill(&mut reader, &mut buf)
            .map_err(|e| CryptoError::IoError(format!("read: {}", e)))?;
        if n == 0 {
            break;
        }
        let encrypted = aes::encrypt_message(&buf[..n], key)?;
        writer
            .write_all(&encrypted)
            .map_err(|e| CryptoError::IoError(format!("write: {}", e)))?;
    }

    writer
        .flush()
        .map_err(|e| CryptoError::IoError(format!("flush: {}", e)))?;
    Ok(())
}

/// Stream-decrypt a file: reads `DECRYPT_CHUNK_SIZE` bytes at a time,
/// decrypts each chunk with AES-128-ECB, and writes plaintext sequentially.
pub fn decrypt_file(input_path: &str, output_path: &str, key: &str) -> Result<(), CryptoError> {
    let input =
        File::open(input_path).map_err(|e| CryptoError::IoError(format!("open input: {}", e)))?;
    let output = File::create(output_path)
        .map_err(|e| CryptoError::IoError(format!("create output: {}", e)))?;

    let mut reader = BufReader::new(input);
    let mut writer = BufWriter::new(output);
    let mut buf = vec![0u8; DECRYPT_CHUNK_SIZE];

    loop {
        let n = read_fill(&mut reader, &mut buf)
            .map_err(|e| CryptoError::IoError(format!("read: {}", e)))?;
        if n == 0 {
            break;
        }
        let decrypted = aes::decrypt_message(&buf[..n], key)?;
        writer
            .write_all(&decrypted)
            .map_err(|e| CryptoError::IoError(format!("write: {}", e)))?;
    }

    writer
        .flush()
        .map_err(|e| CryptoError::IoError(format!("flush: {}", e)))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

/// Generate a random file encryption key (16 random bytes → 32 hex chars).
pub fn generate_file_key() -> String {
    let key: [u8; 16] = rand::random();
    hex::encode(key)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Read into `buf` until it is full or EOF. Returns total bytes read.
fn read_fill(reader: &mut impl Read, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut total = 0;
    while total < buf.len() {
        match reader.read(&mut buf[total..]) {
            Ok(0) => break,
            Ok(n) => total += n,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        }
    }
    Ok(total)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunk_roundtrip() {
        let key = "0123456789abcdef0123456789abcdef";
        let data = b"Hello, this is a test chunk of data for file encryption!";
        let encrypted = encrypt_file_chunk(data, key);
        let decrypted = decrypt_file_chunk(&encrypted, key);
        assert_eq!(decrypted, data);
    }

    #[test]
    fn full_chunk_size() {
        let key = "0123456789abcdef";
        let data = vec![0x42u8; ENCRYPT_CHUNK_SIZE];
        let encrypted = encrypt_file_chunk(&data, key);
        assert_eq!(
            encrypted.len(),
            DECRYPT_CHUNK_SIZE,
            "102400 is 16-aligned → PKCS7 adds a full 16-byte padding block"
        );
        let decrypted = decrypt_file_chunk(&encrypted, key);
        assert_eq!(decrypted, data);
    }

    #[test]
    fn small_chunk() {
        let key = "0123456789abcdef";
        let data = b"tiny";
        let encrypted = encrypt_file_chunk(data, key);
        let decrypted = decrypt_file_chunk(&encrypted, key);
        assert_eq!(decrypted, data);
    }

    #[test]
    fn file_encrypt_decrypt_roundtrip() {
        let key = "0123456789abcdef";
        let original = vec![0xABu8; 250_000]; // ~244 KiB, multiple chunks
        let dir = std::env::temp_dir();
        let input_path = dir.join("ocs_crypto_test_input.bin");
        let enc_path = dir.join("ocs_crypto_test_enc.bin");
        let dec_path = dir.join("ocs_crypto_test_dec.bin");

        std::fs::write(&input_path, &original).unwrap();

        encrypt_file(
            input_path.to_str().unwrap(),
            enc_path.to_str().unwrap(),
            key,
        )
        .unwrap();

        decrypt_file(
            enc_path.to_str().unwrap(),
            dec_path.to_str().unwrap(),
            key,
        )
        .unwrap();

        let result = std::fs::read(&dec_path).unwrap();
        assert_eq!(result, original);

        let _ = std::fs::remove_file(&input_path);
        let _ = std::fs::remove_file(&enc_path);
        let _ = std::fs::remove_file(&dec_path);
    }

    #[test]
    fn file_exact_chunk_boundary() {
        let key = "testkey_16chars!";
        let original = vec![0xCDu8; ENCRYPT_CHUNK_SIZE];
        let dir = std::env::temp_dir();
        let input_path = dir.join("ocs_crypto_boundary_in.bin");
        let enc_path = dir.join("ocs_crypto_boundary_enc.bin");
        let dec_path = dir.join("ocs_crypto_boundary_dec.bin");

        std::fs::write(&input_path, &original).unwrap();

        encrypt_file(
            input_path.to_str().unwrap(),
            enc_path.to_str().unwrap(),
            key,
        )
        .unwrap();

        let enc_size = std::fs::metadata(&enc_path).unwrap().len() as usize;
        assert_eq!(enc_size, DECRYPT_CHUNK_SIZE);

        decrypt_file(
            enc_path.to_str().unwrap(),
            dec_path.to_str().unwrap(),
            key,
        )
        .unwrap();

        let result = std::fs::read(&dec_path).unwrap();
        assert_eq!(result, original);

        let _ = std::fs::remove_file(&input_path);
        let _ = std::fs::remove_file(&enc_path);
        let _ = std::fs::remove_file(&dec_path);
    }

    #[test]
    fn file_empty_input() {
        let key = "0123456789abcdef";
        let dir = std::env::temp_dir();
        let input_path = dir.join("ocs_crypto_empty_in.bin");
        let enc_path = dir.join("ocs_crypto_empty_enc.bin");
        let dec_path = dir.join("ocs_crypto_empty_dec.bin");

        std::fs::write(&input_path, b"").unwrap();

        encrypt_file(
            input_path.to_str().unwrap(),
            enc_path.to_str().unwrap(),
            key,
        )
        .unwrap();

        decrypt_file(
            enc_path.to_str().unwrap(),
            dec_path.to_str().unwrap(),
            key,
        )
        .unwrap();

        let result = std::fs::read(&dec_path).unwrap();
        assert!(result.is_empty());

        let _ = std::fs::remove_file(&input_path);
        let _ = std::fs::remove_file(&enc_path);
        let _ = std::fs::remove_file(&dec_path);
    }

    #[test]
    fn file_nonexistent_input() {
        let result = encrypt_file("/no/such/path", "/tmp/out", "key");
        assert!(result.is_err());
    }

    #[test]
    fn generate_file_key_format() {
        let key = generate_file_key();
        assert_eq!(key.len(), 32);
        assert!(key.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn generate_file_key_unique() {
        let k1 = generate_file_key();
        let k2 = generate_file_key();
        assert_ne!(k1, k2, "Two generated keys should differ");
    }
}
