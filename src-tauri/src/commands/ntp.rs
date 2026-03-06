use std::net::UdpSocket;
use std::time::Duration;

const NTP_PORT: u16 = 123;
const NTP_SERVERS: &[&str] = &["cn.pool.ntp.org", "time.google.com", "pool.ntp.org"];

#[tauri::command]
pub async fn get_ntp_time() -> Result<i64, String> {
    for server in NTP_SERVERS {
        match query_ntp(server) {
            Ok(ts) => return Ok(ts),
            Err(_) => continue,
        }
    }
    Err("All NTP servers unreachable".into())
}

fn query_ntp(server: &str) -> Result<i64, String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket
        .set_read_timeout(Some(Duration::from_secs(3)))
        .map_err(|e| e.to_string())?;

    let addr = format!("{}:{}", server, NTP_PORT);
    socket.connect(&addr).map_err(|e| e.to_string())?;

    let mut buf = [0u8; 48];
    buf[0] = 0x1B; // LI=0, VN=3, Mode=3 (client)

    socket.send(&buf).map_err(|e| e.to_string())?;
    socket.recv(&mut buf).map_err(|e| e.to_string())?;

    let secs = u32::from_be_bytes([buf[40], buf[41], buf[42], buf[43]]);
    let frac = u32::from_be_bytes([buf[44], buf[45], buf[46], buf[47]]);

    // NTP epoch is 1900-01-01, Unix epoch is 1970-01-01 (70 years = 2208988800 seconds)
    let unix_secs = secs as i64 - 2_208_988_800;
    let millis = (frac as f64 / (u32::MAX as f64) * 1000.0) as i64;
    Ok(unix_secs * 1000 + millis)
}
