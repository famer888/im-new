use super::WsError;
use crate::crypto::aes;

const HEADER_SIZE: usize = 16;

#[derive(Debug, Clone)]
pub struct WsPacket {
    pub cmd: u16,
    pub msg_id: i64,
    /// Decrypted protobuf bytes.
    pub payload: Vec<u8>,
}

/// Encode a protobuf payload into a WS binary packet for sending to the server.
///
/// ## Without MAC (standard format — 16-byte header)
///
/// ```text
/// [0]      isJM = 0x01
/// [1]      isZip = 0x00
/// [2..4]   cmd            (big-endian u16)
/// [4..8]   content_length (big-endian u32, length of encrypted payload)
/// [8..16]  msg_id         (big-endian i64)
/// [16..]   AES-ECB encrypted protobuf
/// ```
///
/// ## With MAC address (trends AES)
///
/// ```text
/// [0]            isJM = 0x01
/// [1]            isZip = 0x00
/// [2..4]         cmd            (big-endian u16)
/// [4..8]         content_length (big-endian u32, includes mac section + encrypted payload)
/// [8..16]        msg_id         (big-endian i64)
/// [16..20]       mac_length     (big-endian u32)
/// [20..20+N]     mac_address    (UTF-8 bytes)
/// [20+N..]       AES-ECB encrypted protobuf
/// ```
pub fn encode_packet(
    cmd: u16,
    msg_id: i64,
    protobuf_payload: &[u8],
    aes_key: &str,
    mac_address: Option<&str>,
) -> Result<Vec<u8>, WsError> {
    let encrypted = aes::encrypt_ecb(protobuf_payload, aes_key.as_bytes())
        .map_err(|e| WsError::EncryptionError(e.to_string()))?;

    let (mac_section_len, mac_bytes) = match mac_address {
        Some(mac) => {
            let mb = mac.as_bytes();
            (4 + mb.len(), Some(mb.to_vec()))
        }
        None => (0, None),
    };

    let content_len = mac_section_len + encrypted.len();
    let total = HEADER_SIZE + mac_section_len + encrypted.len();
    let mut packet = Vec::with_capacity(total);

    // Fixed header (16 bytes)
    packet.push(0x01); // isJM — encrypted flag
    packet.push(0x00); // isZip
    packet.extend_from_slice(&cmd.to_be_bytes());
    packet.extend_from_slice(&(content_len as u32).to_be_bytes());
    packet.extend_from_slice(&msg_id.to_be_bytes());

    // Optional MAC section
    if let Some(mb) = mac_bytes {
        packet.extend_from_slice(&(mb.len() as u32).to_be_bytes());
        packet.extend_from_slice(&mb);
    }

    // Encrypted protobuf payload
    packet.extend_from_slice(&encrypted);
    Ok(packet)
}

/// Decode a binary packet received from the server.
///
/// ```text
/// [0..2]   header/flags
/// [2..4]   cmd code    (big-endian u16 — response code like 20001, 20102, etc.)
/// [4..8]   reserved
/// [8..16]  msg_id      (big-endian u64 reinterpreted as i64)
/// [16..]   AES-ECB encrypted protobuf
/// ```
pub fn decode_packet(data: &[u8], aes_key: &str) -> Result<WsPacket, WsError> {
    if data.len() < HEADER_SIZE {
        return Err(WsError::DecodeError(format!(
            "packet too short: {} bytes (need at least {})",
            data.len(),
            HEADER_SIZE,
        )));
    }

    let cmd = u16::from_be_bytes([data[2], data[3]]);
    let msg_id = i64::from_be_bytes([
        data[8], data[9], data[10], data[11], data[12], data[13], data[14], data[15],
    ]);

    let encrypted = &data[HEADER_SIZE..];
    if encrypted.is_empty() {
        return Ok(WsPacket {
            cmd,
            msg_id,
            payload: Vec::new(),
        });
    }

    let payload = aes::decrypt_ecb(encrypted, aes_key.as_bytes())
        .map_err(|e| WsError::EncryptionError(e.to_string()))?;

    Ok(WsPacket {
        cmd,
        msg_id,
        payload,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_without_mac() {
        let key = "0123456789abcdef0123456789abcdef";
        let original = b"Hello, OCS Chat!";
        let cmd = 10001u16;
        let msg_id = 42i64;

        let encoded = encode_packet(cmd, msg_id, original, key, None).unwrap();

        assert_eq!(encoded[0], 0x01);
        assert_eq!(encoded[1], 0x00);
        assert_eq!(u16::from_be_bytes([encoded[2], encoded[3]]), cmd);

        // Construct a server-style packet from the encrypted portion.
        let encrypted_payload = &encoded[HEADER_SIZE..];
        let mut server_pkt = Vec::new();
        server_pkt.extend_from_slice(&[0x00, 0x00]); // header
        server_pkt.extend_from_slice(&cmd.to_be_bytes());
        server_pkt.extend_from_slice(&[0x00; 4]); // reserved
        server_pkt.extend_from_slice(&msg_id.to_be_bytes());
        server_pkt.extend_from_slice(encrypted_payload);

        let decoded = decode_packet(&server_pkt, key).unwrap();
        assert_eq!(decoded.cmd, cmd);
        assert_eq!(decoded.msg_id, msg_id);
        assert_eq!(decoded.payload, original);
    }

    #[test]
    fn encode_with_mac_address() {
        let key = "0123456789abcdef0123456789abcdef";
        let payload = b"test";
        let mac = "AA:BB:CC:DD:EE:FF";

        let encoded = encode_packet(10001, 1, payload, key, Some(mac)).unwrap();

        let mac_len =
            u32::from_be_bytes([encoded[16], encoded[17], encoded[18], encoded[19]]) as usize;
        assert_eq!(mac_len, mac.len());

        let mac_str = std::str::from_utf8(&encoded[20..20 + mac_len]).unwrap();
        assert_eq!(mac_str, mac);
    }

    #[test]
    fn decode_empty_payload() {
        let key = "0123456789abcdef0123456789abcdef";
        let mut pkt = vec![0u8; 16];
        pkt[2] = 0x4E; // high byte
        pkt[3] = 0x21; // low byte → 20001

        let decoded = decode_packet(&pkt, key).unwrap();
        assert_eq!(decoded.cmd, 20001);
        assert!(decoded.payload.is_empty());
    }

    #[test]
    fn decode_rejects_short_packet() {
        let key = "test";
        assert!(decode_packet(&[0u8; 10], key).is_err());
    }
}
