use base64::{engine::general_purpose, Engine as _};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::{HashMap, HashSet};
use std::io::SeekFrom;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{Emitter, State};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use uuid::Uuid;

use crate::crypto;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
fn hidden_windows_command(program: &str) -> Command {
    let mut command = Command::new(program);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadResult {
    pub url: String,
    pub file_key: String,
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub msg_id: String,
    pub progress: f64, // 0.0 - 1.0
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub status: String, // "downloading", "decrypting", "done", "error"
    pub data_url: Option<String>,
    pub file_path: Option<String>,
    pub is_dangerous: bool,
}

#[derive(Debug, Clone)]
struct VideoStreamSource {
    stream_id: String,
    urls: Vec<String>,
    file_key: String,
    mime_type: String,
    plain_size: u64,
}

#[derive(Debug, Clone)]
struct LocalVideoStreamSource {
    path: PathBuf,
    mime_type: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVideoStreamUrlRequest {
    pub url: String,
    pub url_candidates: Option<Vec<String>>,
    pub file_key: String,
    pub mime_type: Option<String>,
    pub size: u64,
    pub name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVideoStreamUrlResponse {
    pub url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLocalVideoStreamUrlRequest {
    pub path: String,
    pub mime_type: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OssPutObjectRequest {
    pub url: String,
    pub bucket: String,
    pub object_key: String,
    pub access_key_id: String,
    pub access_key_secret: String,
    pub security_token: String,
    pub content_type: String,
    pub body_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OssPutObjectResult {
    pub status: u16,
    pub ok: bool,
    pub body: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageSendLogPayload {
    pub level: Option<String>,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

static AUDIO_PLAYERS: OnceLock<Mutex<HashMap<String, Child>>> = OnceLock::new();
static ACTIVE_DOWNLOADS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static VIDEO_STREAMS: OnceLock<Mutex<HashMap<String, VideoStreamSource>>> = OnceLock::new();
static LOCAL_VIDEO_STREAMS: OnceLock<Mutex<HashMap<String, LocalVideoStreamSource>>> = OnceLock::new();
static VIDEO_STREAM_PORT: OnceLock<Mutex<Option<u16>>> = OnceLock::new();
static VIDEO_DECRYPTED_CHUNK_CACHE: OnceLock<Mutex<HashMap<String, Vec<u8>>>> = OnceLock::new();

const VIDEO_STREAM_WINDOW_BYTES: u64 = 2 * 1024 * 1024;
const VIDEO_STREAM_BATCH_CHUNKS: u64 = 8;

fn audio_players() -> &'static Mutex<HashMap<String, Child>> {
    AUDIO_PLAYERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn active_downloads() -> &'static Mutex<HashSet<String>> {
    ACTIVE_DOWNLOADS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn video_streams() -> &'static Mutex<HashMap<String, VideoStreamSource>> {
    VIDEO_STREAMS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn local_video_streams() -> &'static Mutex<HashMap<String, LocalVideoStreamSource>> {
    LOCAL_VIDEO_STREAMS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn video_stream_port() -> &'static Mutex<Option<u16>> {
    VIDEO_STREAM_PORT.get_or_init(|| Mutex::new(None))
}

fn video_decrypted_chunk_cache() -> &'static Mutex<HashMap<String, Vec<u8>>> {
    VIDEO_DECRYPTED_CHUNK_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn video_chunk_cache_key(source: &VideoStreamSource, chunk_index: u64) -> String {
    format!("{}:{}", source.stream_id, chunk_index)
}

fn get_cached_video_chunk(source: &VideoStreamSource, chunk_index: u64) -> Result<Option<Vec<u8>>, String> {
    let cache = video_decrypted_chunk_cache()
        .lock()
        .map_err(|_| "video stream cache lock poisoned".to_string())?;
    Ok(cache.get(&video_chunk_cache_key(source, chunk_index)).cloned())
}

fn cache_video_chunk(source: &VideoStreamSource, chunk_index: u64, decrypted: Vec<u8>) -> Result<(), String> {
    let mut cache = video_decrypted_chunk_cache()
        .lock()
        .map_err(|_| "video stream cache lock poisoned".to_string())?;
    cache.insert(video_chunk_cache_key(source, chunk_index), decrypted);
    Ok(())
}

async fn prefetch_video_stream_chunks(source: VideoStreamSource) {
    let client = reqwest::Client::new();
    let plain_chunk_size = crypto::file_crypto::ENCRYPT_CHUNK_SIZE as u64;
    let last_chunk = source.plain_size.saturating_sub(1) / plain_chunk_size;
    let mut chunks = vec![0, last_chunk];
    if last_chunk > 0 {
        chunks.push(last_chunk - 1);
    }
    chunks.sort_unstable();
    chunks.dedup();

    for chunk_index in chunks {
        if get_cached_video_chunk(&source, chunk_index).ok().flatten().is_some() {
            continue;
        }
        let Some((encrypted_start, encrypted_end)) = encrypted_range_for_plain_chunk(chunk_index, source.plain_size) else {
            continue;
        };
        let result = async {
            let encrypted = fetch_remote_encrypted_range(&client, &source, encrypted_start, encrypted_end).await?;
            let decrypted = crypto::aes::decrypt_message(&encrypted, &source.file_key)
                .map_err(|e| format!("prefetch decrypt failed: {}", e))?;
            cache_video_chunk(&source, chunk_index, decrypted)?;
            Ok::<(), String>(())
        }.await;
        match result {
            Ok(()) => eprintln!("[video-stream] prefetch chunk done chunk_index={}", chunk_index),
            Err(error) => eprintln!("[video-stream] prefetch chunk failed chunk_index={} error={}", chunk_index, error),
        }
    }
}

fn safe_stream_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('_');
    if trimmed.is_empty() {
        "video.mp4".to_string()
    } else {
        trimmed.to_string()
    }
}

fn video_mime_from_name(name: &str, explicit: &str) -> String {
    let mime = explicit.trim();
    if !mime.is_empty() {
        return mime.to_string();
    }
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".mov") {
        "video/quicktime".to_string()
    } else if lower.ends_with(".webm") {
        "video/webm".to_string()
    } else if lower.ends_with(".ogg") || lower.ends_with(".ogv") {
        "video/ogg".to_string()
    } else {
        "video/mp4".to_string()
    }
}

fn encrypted_chunk_len(plain_len: u64) -> u64 {
    let pad = 16 - (plain_len % 16);
    plain_len + if pad == 0 { 16 } else { pad }
}

fn encrypted_range_for_plain_chunk(chunk_index: u64, plain_size: u64) -> Option<(u64, u64)> {
    let plain_chunk_size = crypto::file_crypto::ENCRYPT_CHUNK_SIZE as u64;
    let encrypted_chunk_size = crypto::file_crypto::DECRYPT_CHUNK_SIZE as u64;
    let plain_start = chunk_index.checked_mul(plain_chunk_size)?;
    if plain_start >= plain_size {
        return None;
    }
    let plain_len = (plain_size - plain_start).min(plain_chunk_size);
    let encrypted_len = if plain_len == plain_chunk_size {
        encrypted_chunk_size
    } else {
        encrypted_chunk_len(plain_len)
    };
    let encrypted_start = chunk_index.checked_mul(encrypted_chunk_size)?;
    Some((encrypted_start, encrypted_start + encrypted_len - 1))
}

fn parse_range_header(headers: &str, size: u64) -> Option<(u64, u64)> {
    let range_line = headers
        .lines()
        .find(|line| line.to_ascii_lowercase().starts_with("range:"))?;
    let value = range_line.split_once(':')?.1.trim();
    let range = value.strip_prefix("bytes=")?;
    let (start_text, end_text) = range.split_once('-')?;

    if start_text.trim().is_empty() {
        let suffix = end_text.trim().parse::<u64>().ok()?;
        if suffix == 0 || size == 0 {
            return None;
        }
        let start = size.saturating_sub(suffix);
        return Some((start, size - 1));
    }

    let start = start_text.trim().parse::<u64>().ok()?;
    if size == 0 || start >= size {
        return None;
    }
    let requested_end = end_text.trim().parse::<u64>().ok();
    let window_end = start
        .saturating_add(VIDEO_STREAM_WINDOW_BYTES)
        .saturating_sub(1);
    let end = requested_end.map_or(window_end, |value| value.min(window_end));
    Some((start, end.min(size - 1)))
}

fn http_response(status: &str, headers: &[(&str, String)], body: &[u8]) -> Vec<u8> {
    let mut response = format!("HTTP/1.1 {}\r\n", status);
    response.push_str("Access-Control-Allow-Origin: *\r\n");
    response.push_str("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n");
    response.push_str("Access-Control-Allow-Headers: Range, Content-Type\r\n");
    response.push_str("Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges\r\n");
    for (key, value) in headers {
        response.push_str(key);
        response.push_str(": ");
        response.push_str(value);
        response.push_str("\r\n");
    }
    response.push_str("\r\n");
    let mut bytes = response.into_bytes();
    bytes.extend_from_slice(body);
    bytes
}

async fn fetch_remote_encrypted_range(
    client: &reqwest::Client,
    source: &VideoStreamSource,
    start: u64,
    end: u64,
) -> Result<Vec<u8>, String> {
    let mut last_error = String::new();
    for url in &source.urls {
        eprintln!(
            "[video-stream] fetch encrypted range start encrypted_start={} encrypted_end={} url_head={}",
            start,
            end,
            url.chars().take(120).collect::<String>(),
        );
        tracing::warn!(
            target: "video-stream",
            url_head = %url.chars().take(120).collect::<String>(),
            encrypted_start = start,
            encrypted_end = end,
            "fetch encrypted range start"
        );
        let response = match client
            .get(url)
            .header(reqwest::header::RANGE, format!("bytes={}-{}", start, end))
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                last_error = format!("stream range request failed: {}", error);
                eprintln!("[video-stream] fetch encrypted range request failed error={}", last_error);
                continue;
            }
        };
        let status = response.status();
        let content_range = response
            .headers()
            .get(reqwest::header::CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_string();
        let content_length = response.content_length().unwrap_or(0);
        eprintln!(
            "[video-stream] fetch encrypted range response status={} ok={} content_length={} content_range={} url_head={}",
            status.as_u16(),
            status.is_success(),
            content_length,
            content_range,
            url.chars().take(120).collect::<String>(),
        );
        tracing::warn!(
            target: "video-stream",
            status = status.as_u16(),
            ok = status.is_success(),
            content_length,
            content_range = %content_range,
            "fetch encrypted range response"
        );
        if !(status == reqwest::StatusCode::PARTIAL_CONTENT || status == reqwest::StatusCode::OK) {
            last_error = format!("stream range request failed: HTTP {}", status.as_u16());
            continue;
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("stream range body failed: {}", e))?;
        eprintln!(
            "[video-stream] fetch encrypted range body encrypted_bytes={} encrypted_head_hex={}",
            bytes.len(),
            bytes_head_hex(&bytes, 16),
        );
        tracing::warn!(
            target: "video-stream",
            encrypted_bytes = bytes.len(),
            encrypted_head_hex = %bytes_head_hex(&bytes, 16),
            "fetch encrypted range body"
        );
        return Ok(bytes.to_vec());
    }
    Err(if last_error.is_empty() {
        "stream range request failed: no url candidates".to_string()
    } else {
        last_error
    })
}

async fn build_decrypted_video_range(
    client: &reqwest::Client,
    source: &VideoStreamSource,
    plain_start: u64,
    plain_end: u64,
) -> Result<Vec<u8>, String> {
    let plain_chunk_size = crypto::file_crypto::ENCRYPT_CHUNK_SIZE as u64;
    let start_chunk = plain_start / plain_chunk_size;
    let end_chunk = plain_end / plain_chunk_size;
    let mut output = Vec::with_capacity((plain_end - plain_start + 1) as usize);

    for chunk_index in start_chunk..=end_chunk {
        let (encrypted_start, encrypted_end) = encrypted_range_for_plain_chunk(chunk_index, source.plain_size)
            .ok_or_else(|| "invalid video stream range".to_string())?;
        eprintln!(
            "[video-stream] decrypt chunk start plain_start={} plain_end={} chunk_index={} encrypted_start={} encrypted_end={}",
            plain_start,
            plain_end,
            chunk_index,
            encrypted_start,
            encrypted_end,
        );
        tracing::warn!(
            target: "video-stream",
            plain_start,
            plain_end,
            chunk_index,
            encrypted_start,
            encrypted_end,
            "decrypt video chunk start"
        );
        let encrypted = fetch_remote_encrypted_range(client, source, encrypted_start, encrypted_end).await?;
        let decrypted = crypto::aes::decrypt_message(&encrypted, &source.file_key)
            .map_err(|e| format!("stream decrypt failed: {}", e))?;

        let chunk_plain_start = chunk_index * plain_chunk_size;
        let slice_start = plain_start.saturating_sub(chunk_plain_start) as usize;
        let slice_end = (plain_end.min(chunk_plain_start + decrypted.len() as u64 - 1) - chunk_plain_start + 1) as usize;
        if slice_start >= decrypted.len() || slice_start >= slice_end || slice_end > decrypted.len() {
            return Err("invalid decrypted stream slice".to_string());
        }
        output.extend_from_slice(&decrypted[slice_start..slice_end]);
        eprintln!(
            "[video-stream] decrypt chunk done chunk_index={} decrypted_bytes={} slice_start={} slice_end={} output_bytes={}",
            chunk_index,
            decrypted.len(),
            slice_start,
            slice_end,
            output.len(),
        );
        tracing::warn!(
            target: "video-stream",
            chunk_index,
            decrypted_bytes = decrypted.len(),
            slice_start,
            slice_end,
            output_bytes = output.len(),
            "decrypt video chunk done"
        );
    }

    Ok(output)
}

async fn stream_decrypted_video_range(
    stream: &mut TcpStream,
    client: &reqwest::Client,
    source: &VideoStreamSource,
    plain_start: u64,
    plain_end: u64,
) -> Result<u64, String> {
    let plain_chunk_size = crypto::file_crypto::ENCRYPT_CHUNK_SIZE as u64;
    let start_chunk = plain_start / plain_chunk_size;
    let end_chunk = plain_end / plain_chunk_size;
    let mut written = 0u64;
    let mut flushed_first_chunk = false;
    let mut chunk_index = start_chunk;

    while chunk_index <= end_chunk {
        if let Some(decrypted) = get_cached_video_chunk(source, chunk_index)? {
            let sent = write_decrypted_video_chunk(
                stream,
                &decrypted,
                plain_start,
                plain_end,
                chunk_index,
                plain_chunk_size,
                &mut written,
                &mut flushed_first_chunk,
            ).await?;
            eprintln!(
                "[video-stream] stream chunk cache hit chunk_index={} sent_bytes={} written_bytes={}",
                chunk_index,
                sent,
                written,
            );
            chunk_index += 1;
            continue;
        }

        let batch_start_chunk = chunk_index;
        let batch_end_chunk = end_chunk.min(batch_start_chunk + VIDEO_STREAM_BATCH_CHUNKS - 1);
        let (encrypted_start, _) = encrypted_range_for_plain_chunk(batch_start_chunk, source.plain_size)
            .ok_or_else(|| "invalid video stream range".to_string())?;
        let (_, encrypted_end) = encrypted_range_for_plain_chunk(batch_end_chunk, source.plain_size)
            .ok_or_else(|| "invalid video stream range".to_string())?;
        eprintln!(
            "[video-stream] stream batch start plain_start={} plain_end={} chunk_start={} chunk_end={} encrypted_start={} encrypted_end={}",
            plain_start,
            plain_end,
            batch_start_chunk,
            batch_end_chunk,
            encrypted_start,
            encrypted_end,
        );
        let encrypted = fetch_remote_encrypted_range(client, source, encrypted_start, encrypted_end).await?;

        let mut encrypted_offset = 0usize;
        for current_chunk in batch_start_chunk..=batch_end_chunk {
            let (_, chunk_encrypted_end) = encrypted_range_for_plain_chunk(current_chunk, source.plain_size)
                .ok_or_else(|| "invalid video stream range".to_string())?;
            let chunk_encrypted_start = if current_chunk == batch_start_chunk {
                encrypted_start
            } else {
                encrypted_range_for_plain_chunk(current_chunk, source.plain_size)
                    .ok_or_else(|| "invalid video stream range".to_string())?
                    .0
            };
            let encrypted_len = (chunk_encrypted_end - chunk_encrypted_start + 1) as usize;
            let encrypted_slice_end = encrypted_offset + encrypted_len;
            if encrypted_slice_end > encrypted.len() {
                return Err("invalid encrypted batch slice".to_string());
            }
            let decrypted = crypto::aes::decrypt_message(&encrypted[encrypted_offset..encrypted_slice_end], &source.file_key)
                .map_err(|e| format!("stream decrypt failed: {}", e))?;
            encrypted_offset = encrypted_slice_end;

            cache_video_chunk(source, current_chunk, decrypted.clone())?;

            let sent = write_decrypted_video_chunk(
                stream,
                &decrypted,
                plain_start,
                plain_end,
                current_chunk,
                plain_chunk_size,
                &mut written,
                &mut flushed_first_chunk,
            ).await?;
            eprintln!(
                "[video-stream] stream chunk sent chunk_index={} decrypted_bytes={} sent_bytes={} written_bytes={}",
                current_chunk,
                decrypted.len(),
                sent,
                written,
            );
        }

        chunk_index = batch_end_chunk + 1;
    }

    Ok(written)
}

async fn write_decrypted_video_chunk(
    stream: &mut TcpStream,
    decrypted: &[u8],
    plain_start: u64,
    plain_end: u64,
    chunk_index: u64,
    plain_chunk_size: u64,
    written: &mut u64,
    flushed_first_chunk: &mut bool,
) -> Result<usize, String> {
    let chunk_plain_start = chunk_index * plain_chunk_size;
    if plain_end < chunk_plain_start || plain_start >= chunk_plain_start + decrypted.len() as u64 {
        return Ok(0);
    }
    let slice_start = plain_start.saturating_sub(chunk_plain_start) as usize;
    let slice_end = (plain_end.min(chunk_plain_start + decrypted.len() as u64 - 1) - chunk_plain_start + 1) as usize;
    if slice_start >= decrypted.len() || slice_start >= slice_end || slice_end > decrypted.len() {
        return Err("invalid decrypted stream slice".to_string());
    }

    let slice = &decrypted[slice_start..slice_end];
    stream
        .write_all(slice)
        .await
        .map_err(|e| format!("write stream body failed: {}", e))?;
    *written += slice.len() as u64;
    if !*flushed_first_chunk {
        stream
            .flush()
            .await
            .map_err(|e| format!("flush stream body failed: {}", e))?;
        *flushed_first_chunk = true;
    }
    Ok(slice.len())
}

async fn read_http_request(stream: &mut TcpStream) -> Result<String, String> {
    let mut buffer = vec![0u8; 16 * 1024];
    let mut read_len = 0usize;
    loop {
        if read_len >= buffer.len() {
            return Err("request header too large".to_string());
        }
        let n = stream
            .read(&mut buffer[read_len..])
            .await
            .map_err(|e| format!("read stream request failed: {}", e))?;
        if n == 0 {
            break;
        }
        read_len += n;
        if buffer[..read_len].windows(4).any(|item| item == b"\r\n\r\n") {
            break;
        }
    }
    String::from_utf8(buffer[..read_len].to_vec()).map_err(|e| format!("invalid request utf8: {}", e))
}

async fn handle_local_video_stream_connection(
    stream: &mut TcpStream,
    method: &str,
    request: &str,
    _path: &str,
    source: LocalVideoStreamSource,
) -> Result<(), String> {
    let Some((start, end)) = parse_range_header(request, source.size).or_else(|| {
        if source.size > 0 {
            Some((0, source.size - 1))
        } else {
            None
        }
    }) else {
        let response = http_response(
            "416 Range Not Satisfiable",
            &[
                ("Accept-Ranges", "bytes".to_string()),
                ("Content-Range", format!("bytes */{}", source.size)),
                ("Content-Length", "0".to_string()),
            ],
            &[],
        );
        let _ = stream.write_all(&response).await;
        return Ok(());
    };

    let content_length = end - start + 1;
    let response = http_response(
        "206 Partial Content",
        &[
            ("Content-Type", source.mime_type.clone()),
            ("Accept-Ranges", "bytes".to_string()),
            ("Content-Range", format!("bytes {}-{}/{}", start, end, source.size)),
            ("Content-Length", content_length.to_string()),
            ("Cache-Control", "no-store".to_string()),
            ("Connection", "close".to_string()),
        ],
        &[],
    );
    stream
        .write_all(&response)
        .await
        .map_err(|e| format!("write local video response headers failed: {}", e))?;
    if method == "HEAD" {
        return Ok(());
    }

    let mut file = tokio::fs::File::open(&source.path)
        .await
        .map_err(|e| format!("open local video failed: {}", e))?;
    file.seek(SeekFrom::Start(start))
        .await
        .map_err(|e| format!("seek local video failed: {}", e))?;

    let mut remaining = content_length;
    let mut buffer = vec![0u8; 128 * 1024];
    while remaining > 0 {
        let read_size = buffer.len().min(remaining as usize);
        let n = file
            .read(&mut buffer[..read_size])
            .await
            .map_err(|e| format!("read local video failed: {}", e))?;
        if n == 0 {
            break;
        }
        stream
            .write_all(&buffer[..n])
            .await
            .map_err(|e| format!("write local video body failed: {}", e))?;
        remaining = remaining.saturating_sub(n as u64);
    }

    Ok(())
}

async fn handle_video_stream_connection(mut stream: TcpStream, client: reqwest::Client) -> Result<(), String> {
    let request = read_http_request(&mut stream).await?;
    let mut lines = request.lines();
    let request_line = lines.next().unwrap_or_default();
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let path = parts.next().unwrap_or_default();
    let range_header = request
        .lines()
        .find(|line| line.to_ascii_lowercase().starts_with("range:"))
        .unwrap_or("");
    eprintln!(
        "[video-stream] local stream request request_line={} range={}",
        request_line,
        range_header,
    );
    tracing::warn!(
        target: "video-stream",
        request_line = %request_line,
        range = %range_header,
        "local stream request"
    );
    if method == "OPTIONS" {
        let response = http_response("204 No Content", &[("Content-Length", "0".to_string())], &[]);
        let _ = stream.write_all(&response).await;
        return Ok(());
    }
    if method != "GET" && method != "HEAD" {
        let response = http_response("405 Method Not Allowed", &[("Content-Length", "0".to_string())], &[]);
        let _ = stream.write_all(&response).await;
        return Ok(());
    }

    let token = path
        .trim_start_matches('/')
        .split('/')
        .nth(1)
        .filter(|_| path.starts_with("/video/"))
        .unwrap_or_default()
        .to_string();
    let source = {
        let streams = video_streams()
            .lock()
            .map_err(|_| "video stream lock poisoned".to_string())?;
        streams.get(&token).cloned()
    };
    let Some(source) = source else {
        let local_source = {
            let streams = local_video_streams()
                .lock()
                .map_err(|_| "local video stream lock poisoned".to_string())?;
            streams.get(&token).cloned()
        };
        if let Some(local_source) = local_source {
            return handle_local_video_stream_connection(
                &mut stream,
                method,
                &request,
                path,
                local_source,
            )
            .await;
        }

        eprintln!("[video-stream] local stream token not found token={}", token);
        tracing::warn!(
            target: "video-stream",
            token = %token,
            "local stream token not found"
        );
        let body = b"video stream not found";
        let response = http_response(
            "404 Not Found",
            &[
                ("Content-Type", "text/plain".to_string()),
                ("Content-Length", body.len().to_string()),
            ],
            body,
        );
        let _ = stream.write_all(&response).await;
        return Ok(());
    };

    let Some((start, end)) = parse_range_header(&request, source.plain_size).or_else(|| {
        if source.plain_size > 0 {
            Some((0, (source.plain_size - 1).min(VIDEO_STREAM_WINDOW_BYTES - 1)))
        } else {
            None
        }
    }) else {
        eprintln!("[video-stream] local stream invalid range plain_size={}", source.plain_size);
        tracing::warn!(
            target: "video-stream",
            plain_size = source.plain_size,
            "local stream invalid range"
        );
        let response = http_response(
            "416 Range Not Satisfiable",
            &[
                ("Accept-Ranges", "bytes".to_string()),
                ("Content-Range", format!("bytes */{}", source.plain_size)),
                ("Content-Length", "0".to_string()),
            ],
            &[],
        );
        let _ = stream.write_all(&response).await;
        return Ok(());
    };

    eprintln!(
        "[video-stream] local stream range resolved method={} path={} plain_start={} plain_end={} plain_size={} mime_type={}",
        method,
        path,
        start,
        end,
        source.plain_size,
        source.mime_type,
    );
    tracing::warn!(
        target: "video-stream",
        method,
        path,
        plain_start = start,
        plain_end = end,
        plain_size = source.plain_size,
        mime_type = %source.mime_type,
        "local stream range resolved"
    );
    let content_length = end - start + 1;
    let response = http_response(
        "206 Partial Content",
        &[
            ("Content-Type", source.mime_type.clone()),
            ("Accept-Ranges", "bytes".to_string()),
            ("Content-Range", format!("bytes {}-{}/{}", start, end, source.plain_size)),
            ("Content-Length", content_length.to_string()),
            ("Cache-Control", "no-store".to_string()),
            ("Connection", "close".to_string()),
        ],
        &[],
    );
    stream
        .write_all(&response)
        .await
        .map_err(|e| format!("write stream response headers failed: {}", e))?;
    if method == "HEAD" {
        eprintln!(
            "[video-stream] local stream head response sent plain_start={} plain_end={} content_length={}",
            start,
            end,
            content_length,
        );
        return Ok(());
    }

    let body_bytes = match stream_decrypted_video_range(&mut stream, &client, &source, start, end).await {
        Ok(written) => written,
        Err(error) => {
            eprintln!(
                "[video-stream] local stream body failed plain_start={} plain_end={} error={}",
                start,
                end,
                error,
            );
            tracing::error!(
                target: "video-stream",
                error = %error,
                plain_start = start,
                plain_end = end,
                "local stream body failed"
            );
            return Err(error);
        }
    };
    eprintln!(
        "[video-stream] local stream response sent method={} plain_start={} plain_end={} body_bytes={}",
        method,
        start,
        end,
        body_bytes,
    );
    tracing::warn!(
        target: "video-stream",
        method,
        plain_start = start,
        plain_end = end,
        body_bytes,
        "local stream response sent"
    );
    Ok(())
}

async fn ensure_video_stream_server() -> Result<u16, String> {
    if let Some(port) = *video_stream_port()
        .lock()
        .map_err(|_| "video stream port lock poisoned".to_string())?
    {
        return Ok(port);
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("bind video stream server failed: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("read video stream server addr failed: {}", e))?
        .port();
    {
        let mut locked = video_stream_port()
            .lock()
            .map_err(|_| "video stream port lock poisoned".to_string())?;
        *locked = Some(port);
    }
    eprintln!("[video-stream] video stream server started port={}", port);
    tracing::warn!(
        target: "video-stream",
        port,
        "video stream server started"
    );

    tokio::spawn(async move {
        let client = reqwest::Client::new();
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let client = client.clone();
                    tokio::spawn(async move {
                        if let Err(error) = handle_video_stream_connection(stream, client).await {
                            tracing::warn!(target: "video-stream", error = %error, "video stream request failed");
                        }
                    });
                }
                Err(error) => {
                    tracing::error!(target: "video-stream", error = %error, "video stream accept failed");
                    break;
                }
            }
        }
    });

    Ok(port)
}

async fn prioritize_video_stream_urls(urls: Vec<String>) -> Vec<String> {
    if urls.len() <= 1 {
        return urls;
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(4))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    for (index, url) in urls.iter().enumerate() {
        eprintln!(
            "[video-stream] probe candidate start index={} url_head={}",
            index,
            url.chars().take(120).collect::<String>(),
        );
        match client
            .get(url)
            .header(reqwest::header::RANGE, "bytes=0-0")
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status();
                eprintln!(
                    "[video-stream] probe candidate response index={} status={} ok={} url_head={}",
                    index,
                    status.as_u16(),
                    status.is_success(),
                    url.chars().take(120).collect::<String>(),
                );
                if status == reqwest::StatusCode::PARTIAL_CONTENT || status == reqwest::StatusCode::OK {
                    let mut prioritized = vec![url.clone()];
                    prioritized.extend(urls.iter().enumerate().filter_map(|(item_index, item)| {
                        if item_index == index {
                            None
                        } else {
                            Some(item.clone())
                        }
                    }));
                    return prioritized;
                }
            }
            Err(error) => {
                eprintln!(
                    "[video-stream] probe candidate failed index={} error={} url_head={}",
                    index,
                    error,
                    url.chars().take(120).collect::<String>(),
                );
            }
        }
    }

    urls
}

#[tauri::command]
pub async fn create_video_stream_url(
    request: CreateVideoStreamUrlRequest,
) -> Result<CreateVideoStreamUrlResponse, String> {
    let url = request.url.trim().to_string();
    let file_key = request.file_key.trim().to_string();
    if url.is_empty() || file_key.is_empty() || request.size == 0 {
        return Err("video stream requires url, fileKey and size".to_string());
    }

    let port = ensure_video_stream_server().await?;
    let token = Uuid::new_v4().to_string();
    let name = safe_stream_file_name(request.name.as_deref().unwrap_or("video.mp4"));
    let mime_type = video_mime_from_name(&name, request.mime_type.as_deref().unwrap_or(""));
    let mut urls = vec![url.clone()];
    if let Some(candidates) = request.url_candidates {
        urls.extend(candidates.into_iter().map(|item| item.trim().to_string()));
    }
    let mut seen_urls = HashSet::new();
    urls.retain(|item| !item.is_empty() && seen_urls.insert(item.clone()));
    let urls = prioritize_video_stream_urls(urls).await;
    eprintln!(
        "[video-stream] create video stream url token={} port={} name={} mime_type={} plain_size={} file_key_len={} candidate_count={} url_head={}",
        token,
        port,
        name,
        mime_type,
        request.size,
        file_key.len(),
        urls.len(),
        url.chars().take(120).collect::<String>(),
    );
    tracing::warn!(
        target: "video-stream",
        token = %token,
        port,
        name = %name,
        mime_type = %mime_type,
        plain_size = request.size,
        file_key_len = file_key.len(),
        url_head = %url.chars().take(120).collect::<String>(),
        "create video stream url"
    );
    {
        let mut streams = video_streams()
            .lock()
            .map_err(|_| "video stream lock poisoned".to_string())?;
        streams.insert(
            token.clone(),
            VideoStreamSource {
                stream_id: token.clone(),
                urls,
                file_key,
                mime_type,
                plain_size: request.size,
            },
        );
    }

    Ok(CreateVideoStreamUrlResponse {
        url: format!("http://localhost:{}/video/{}/{}", port, token, name),
    })
}

#[tauri::command]
pub async fn create_local_video_stream_url(
    request: CreateLocalVideoStreamUrlRequest,
) -> Result<CreateVideoStreamUrlResponse, String> {
    let path = PathBuf::from(request.path.trim());
    if !path.exists() {
        return Err(format!("local video file not found: {}", path.to_string_lossy()));
    }
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| format!("stat local video failed: {}", e))?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err("local video file is invalid".to_string());
    }

    let port = ensure_video_stream_server().await?;
    let name = safe_stream_file_name(
        request
            .name
            .as_deref()
            .or_else(|| path.file_name().and_then(|value| value.to_str()))
            .unwrap_or("video.mp4"),
    );
    let mime_type = video_mime_from_name(&name, request.mime_type.as_deref().unwrap_or(""));
    let token = Uuid::new_v4().to_string();

    {
        let mut streams = local_video_streams()
            .lock()
            .map_err(|_| "local video stream lock poisoned".to_string())?;
        streams.insert(
            token.clone(),
            LocalVideoStreamSource {
                path,
                mime_type,
                size: metadata.len(),
            },
        );
    }

    Ok(CreateVideoStreamUrlResponse {
        url: format!("http://localhost:{}/video/{}/{}", port, token, name),
    })
}

fn stop_audio_children(players: &mut HashMap<String, Child>, keep_id: Option<&str>) {
    let ids: Vec<String> = players.keys().cloned().collect();
    for id in ids {
        if keep_id == Some(id.as_str()) {
            continue;
        }
        if let Some(mut child) = players.remove(&id) {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[tauri::command]
pub fn image_send_log(payload: ImageSendLogPayload) -> Result<(), String> {
    let data = payload
        .data
        .map(|value| value.to_string())
        .unwrap_or_else(|| "{}".to_string());

    let is_audio_log = payload.message.starts_with("[audio-message]")
        || payload.message.starts_with("[group-audio]");
    let is_group_audio_log = payload.message.starts_with("[group-audio]");
    let is_file_log =
        payload.message.starts_with("[file-send]") || payload.message.starts_with("[file-open]");
    match (
        is_audio_log,
        is_group_audio_log,
        is_file_log,
        payload.level.as_deref().unwrap_or("info"),
    ) {
        (true, true, _, "error") => {
            tracing::error!(target: "group-audio", data = %data, "{}", payload.message)
        }
        (true, true, _, "warn") => {
            tracing::warn!(target: "group-audio", data = %data, "{}", payload.message)
        }
        (true, true, _, _) => {
            tracing::info!(target: "group-audio", data = %data, "{}", payload.message)
        }
        (true, false, _, "error") => {
            tracing::error!(target: "audio-message", data = %data, "{}", payload.message)
        }
        (true, false, _, "warn") => {
            tracing::warn!(target: "audio-message", data = %data, "{}", payload.message)
        }
        (true, false, _, _) => {
            tracing::info!(target: "audio-message", data = %data, "{}", payload.message)
        }
        (false, _, true, "error") => {
            tracing::error!(target: "file-send", data = %data, "{}", payload.message)
        }
        (false, _, true, "warn") => {
            tracing::warn!(target: "file-send", data = %data, "{}", payload.message)
        }
        (false, _, true, _) => {
            tracing::info!(target: "file-send", data = %data, "{}", payload.message)
        }
        (false, _, false, "error") => {
            tracing::error!(target: "image-send", data = %data, "{}", payload.message)
        }
        (false, _, false, "warn") => {
            tracing::warn!(target: "image-send", data = %data, "{}", payload.message)
        }
        (false, _, false, _) => {
            tracing::info!(target: "image-send", data = %data, "{}", payload.message)
        }
    }

    Ok(())
}

#[tauri::command]
pub fn play_audio_file(msg_id: String, file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("audio file not found: {}", file_path));
    }

    let mut players = audio_players()
        .lock()
        .map_err(|_| "audio player lock poisoned".to_string())?;
    stop_audio_children(&mut players, None);

    #[cfg(target_os = "macos")]
    let child = Command::new("afplay")
        .arg(&path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("spawn afplay failed: {}", e))?;

    #[cfg(not(target_os = "macos"))]
    let child = {
        return Err("audio playback is currently only implemented on macOS".to_string());
    };

    players.insert(msg_id.clone(), child);
    Ok(())
}

#[tauri::command]
pub fn stop_audio_file(msg_id: Option<String>) -> Result<(), String> {
    let mut players = audio_players()
        .lock()
        .map_err(|_| "audio player lock poisoned".to_string())?;

    if let Some(id) = msg_id {
        if let Some(mut child) = players.remove(&id) {
            let _ = child.kill();
            let _ = child.wait();
        }
    } else {
        stop_audio_children(&mut players, None);
    }
    Ok(())
}

fn hmac_sha1_base64(secret: &str, message: &str) -> String {
    let mut key = secret.as_bytes().to_vec();
    if key.len() > 64 {
        key = Sha1::digest(&key).to_vec();
    }
    key.resize(64, 0);

    let mut ipad = [0x36_u8; 64];
    let mut opad = [0x5c_u8; 64];
    for (idx, byte) in key.iter().enumerate() {
        ipad[idx] ^= byte;
        opad[idx] ^= byte;
    }

    let mut inner = Sha1::new();
    inner.update(ipad);
    inner.update(message.as_bytes());
    let inner_hash = inner.finalize();

    let mut outer = Sha1::new();
    outer.update(opad);
    outer.update(inner_hash);
    general_purpose::STANDARD.encode(outer.finalize())
}

fn oss_rfc1123_date() -> String {
    chrono::Utc::now()
        .format("%a, %d %b %Y %H:%M:%S GMT")
        .to_string()
}

fn sniff_image_mime(bytes: &[u8]) -> &'static str {
    if bytes.len() >= 8
        && bytes[0] == 0x89
        && bytes[1] == b'P'
        && bytes[2] == b'N'
        && bytes[3] == b'G'
    {
        return "image/png";
    }
    if bytes.len() >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff {
        return "image/jpeg";
    }
    if bytes.len() >= 6 && (&bytes[..6] == b"GIF87a" || &bytes[..6] == b"GIF89a") {
        return "image/gif";
    }
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return "image/webp";
    }
    if bytes.len() >= 2 && &bytes[..2] == b"BM" {
        return "image/bmp";
    }
    if bytes.len() >= 12 && (&bytes[4..12] == b"ftypavif" || &bytes[4..12] == b"ftypavis") {
        return "image/avif";
    }
    let head_len = bytes.len().min(200);
    if let Ok(head) = std::str::from_utf8(&bytes[..head_len]) {
        let trimmed = head.trim_start();
        if trimmed.starts_with("<svg") || trimmed.starts_with("<?xml") {
            return "image/svg+xml";
        }
    }
    "image/png"
}

fn bytes_head_hex(bytes: &[u8], len: usize) -> String {
    bytes
        .iter()
        .take(len)
        .map(|byte| format!("{:02X}", byte))
        .collect::<Vec<_>>()
        .join(" ")
}

fn has_dangerous_extension(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "exe"
            | "bat"
            | "cmd"
            | "vbs"
            | "js"
            | "ps1"
            | "scr"
            | "pif"
            | "msi"
            | "com"
            | "lnk"
            | "wsf"
    )
}

fn has_dangerous_magic(bytes: &[u8]) -> bool {
    if bytes.len() >= 2 && &bytes[..2] == b"MZ" {
        return true;
    }
    if bytes.len() >= 4 && &bytes[..4] == b"\x7FELF" {
        return true;
    }
    if bytes.len() >= 4
        && matches!(
            &bytes[..4],
            b"\xFE\xED\xFA\xCE" | b"\xFE\xED\xFA\xCF" | b"\xCE\xFA\xED\xFE" | b"\xCF\xFA\xED\xFE"
        )
    {
        return true;
    }
    let head = String::from_utf8_lossy(bytes).to_ascii_lowercase();
    head.contains("@echo")
        || head.contains("cmd.exe")
        || head.contains("powershell")
        || head.contains("createobject")
}

async fn quarantine_dangerous_file(path: &Path) -> Result<(PathBuf, bool), String> {
    let head = tokio::fs::read(path)
        .await
        .map_err(|e| format!("read downloaded file for danger check failed: {}", e))?;
    if !has_dangerous_extension(path) && !has_dangerous_magic(&head[..head.len().min(512)]) {
        return Ok((path.to_path_buf(), false));
    }

    // 高危文件不保留在普通缓存路径，统一移动到系统临时 dangerous 目录并追加 .dangerous 后缀。
    let dangerous_dir = std::env::temp_dir().join("ocs-chat-dangerous");
    tokio::fs::create_dir_all(&dangerous_dir)
        .await
        .map_err(|e| format!("create dangerous dir failed: {}", e))?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("file");
    let dangerous_path = dangerous_dir.join(format!("{}.dangerous", file_name));
    let _ = tokio::fs::remove_file(&dangerous_path).await;
    tokio::fs::rename(path, &dangerous_path)
        .await
        .map_err(|e| format!("move dangerous file failed: {}", e))?;
    Ok((dangerous_path, true))
}

#[tauri::command]
pub async fn upload_file(
    crypto_engine: State<'_, crypto::CryptoEngine>,
    file_path: String,
    _uid: String,
) -> Result<UploadResult, String> {
    let path = PathBuf::from(&file_path);
    let file_key = crypto::file_crypto::generate_file_key();

    let encrypted_path = path.with_extension("enc");
    crypto::file_crypto::encrypt_file(
        path.to_str().unwrap_or_default(),
        encrypted_path.to_str().unwrap_or_default(),
        &file_key,
    )
    .map_err(|e| e.to_string())?;

    // TODO: Upload encrypted data to OSS
    Ok(UploadResult {
        url: String::new(),
        file_key,
        file_size: 0,
    })
}

#[tauri::command]
pub async fn upload_oss_object(request: OssPutObjectRequest) -> Result<OssPutObjectResult, String> {
    let body = general_purpose::STANDARD
        .decode(request.body_base64.trim())
        .map_err(|e| format!("decode upload body failed: {}", e))?;
    let oss_date = oss_rfc1123_date();
    let content_type = if request.content_type.trim().is_empty() {
        "application/octet-stream".to_string()
    } else {
        request.content_type.trim().to_string()
    };
    let url =
        url::Url::parse(&request.url).map_err(|e| format!("invalid oss upload url: {}", e))?;
    let object_path = url.path().trim_start_matches('/');
    let object_key = if object_path.is_empty() {
        request.object_key.trim_start_matches('/')
    } else {
        object_path
    };
    let canonical_resource = format!("/{}/{}", request.bucket.trim(), object_key);
    let canonical_headers = format!(
        "x-oss-date:{}\nx-oss-security-token:{}\n",
        oss_date, request.security_token
    );
    let string_to_sign = format!(
        "PUT\n\n{}\n{}\n{}{}",
        content_type, oss_date, canonical_headers, canonical_resource
    );
    let signature = hmac_sha1_base64(&request.access_key_secret, &string_to_sign);
    let authorization = format!("OSS {}:{}", &request.access_key_id, signature);

    tracing::info!(
        target: "image-send",
        "rust oss put start url_host={} body_bytes={} bucket={} object_key_head={} object_key_len={} content_type={} has_access_key={} has_secret={} has_token={} canonical_resource_head={} sign_len={}",
        url.host_str().unwrap_or_default(),
        body.len(),
        request.bucket,
        object_key.chars().take(24).collect::<String>(),
        object_key.len(),
        content_type,
        !request.access_key_id.is_empty(),
        !request.access_key_secret.is_empty(),
        !request.security_token.is_empty(),
        canonical_resource,
        string_to_sign.len(),
    );

    let response = reqwest::Client::new()
        .put(url)
        .header("Authorization", authorization)
        .header("x-oss-date", oss_date)
        .header("Content-Type", content_type)
        .header("x-oss-security-token", request.security_token)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("oss put request failed: {}", e))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .unwrap_or_else(|e| format!("read oss response failed: {}", e));
    let body_preview: String = text.chars().take(4000).collect();

    tracing::info!(
        target: "image-send",
        "rust oss put response status={} ok={} body_head={}",
        status.as_u16(),
        status.is_success(),
        body_preview,
    );

    if !status.is_success() {
        return Err(format!(
            "oss put failed: HTTP {} {}",
            status.as_u16(),
            body_preview
        ));
    }

    Ok(OssPutObjectResult {
        status: status.as_u16(),
        ok: true,
        body: body_preview,
    })
}

#[tauri::command]
pub async fn download_file(
    app: tauri::AppHandle,
    url: String,
    file_key: String,
    save_path: String,
    msg_id: String,
    log_tag: Option<String>,
    emit_data_url: Option<bool>,
) -> Result<(), String> {
    let path = PathBuf::from(&save_path);
    // 图片/视频组件会因重渲染、缩略图失败重试、重复点击同时请求同一文件；
    // 这里按 msg_id + save_path 去重，让后续请求复用当前任务最终的 file:done/file:error 事件。
    let download_key = format!("{}|{}", msg_id, path.to_string_lossy());
    {
        let mut active = active_downloads()
            .lock()
            .map_err(|_| "active download lock poisoned".to_string())?;
        if !active.insert(download_key.clone()) {
            return Ok(());
        }
    }
    let should_emit_data_url = emit_data_url.unwrap_or(true);
    let should_log_audio = log_tag.as_deref() == Some("group-audio");
    let should_log_file_open = log_tag.as_deref() == Some("file-open");
    let should_log_video_menu = log_tag.as_deref() == Some("video-menu");
    if should_log_video_menu {
        eprintln!(
            "[video-menu] download_file request msg_id={} url_head={} save_path={} file_key_len={} emit_data_url={}",
            msg_id,
            url.chars().take(180).collect::<String>(),
            save_path,
            file_key.len(),
            should_emit_data_url,
        );
    }
    if should_log_audio {
        tracing::info!(
            target: "group-audio",
            "download_file request msg_id={} url_head={} save_path={} file_key_head={} file_key_len={}",
            msg_id,
            url.chars().take(120).collect::<String>(),
            save_path,
            file_key.chars().take(10).collect::<String>(),
            file_key.len(),
        );
    }
    if should_log_file_open {
        tracing::warn!(
            target: "file-open",
            msg_id = %msg_id,
            url_head = %url.chars().take(160).collect::<String>(),
            save_path = %save_path,
            file_key_len = file_key.len(),
            "download_file request"
        );
    }

    let app_clone = app.clone();
    let msg_id_clone = msg_id.clone();
    let should_log_audio_clone = should_log_audio;
    let should_log_file_open_clone = should_log_file_open;
    let should_log_video_menu_clone = should_log_video_menu;

    tokio::spawn(async move {
        let download_result = async {
            if tokio::fs::try_exists(&path).await.unwrap_or(false) {
                let (final_path, is_dangerous) = quarantine_dangerous_file(&path).await?;
                let meta = tokio::fs::metadata(&final_path)
                    .await
                    .map_err(|e| format!("Stat cached file failed: {}", e))?;
                if !should_emit_data_url {
                    if should_log_video_menu_clone {
                        eprintln!(
                            "[video-menu] download_file cache hit msg_id={} path={} bytes={}",
                            msg_id_clone,
                            final_path.to_string_lossy(),
                            meta.len(),
                        );
                    }
                    return Ok::<(u64, Option<String>, PathBuf, bool), String>((
                        meta.len(),
                        None,
                        final_path,
                        is_dangerous,
                    ));
                }
                let decoded = tokio::fs::read(&final_path)
                    .await
                    .map_err(|e| format!("Read cached file failed: {}", e))?;
                if should_log_audio_clone {
                    tracing::info!(
                        target: "group-audio",
                        "download_file cache hit msg_id={} path={} bytes={} head_hex={}",
                        msg_id_clone,
                        final_path.to_string_lossy(),
                        decoded.len(),
                        bytes_head_hex(&decoded, 16),
                    );
                }
                if should_log_file_open_clone {
                    tracing::warn!(
                        target: "file-open",
                        msg_id = %msg_id_clone,
                        path = %final_path.to_string_lossy(),
                        bytes = meta.len(),
                        "download_file cache hit"
                    );
                }
                let mime = sniff_image_mime(&decoded);
                let data_url = format!(
                    "data:{};base64,{}",
                    mime,
                    general_purpose::STANDARD.encode(&decoded)
                );
                return Ok::<(u64, Option<String>, PathBuf, bool), String>((
                    decoded.len() as u64,
                    Some(data_url),
                    final_path,
                    is_dangerous,
                ));
            }

            if should_log_audio_clone {
                tracing::info!(
                    target: "group-audio",
                    "download_file http start msg_id={} url_head={}",
                    msg_id_clone,
                    url.chars().take(120).collect::<String>(),
                );
            }
            if should_log_file_open_clone {
                tracing::warn!(
                    target: "file-open",
                    msg_id = %msg_id_clone,
                    url_head = %url.chars().take(160).collect::<String>(),
                    "download_file http start"
                );
            }
            if should_log_video_menu_clone {
                eprintln!(
                    "[video-menu] download_file http start msg_id={} url_head={}",
                    msg_id_clone,
                    url.chars().take(180).collect::<String>(),
                );
            }
            let response = reqwest::get(&url)
                .await
                .map_err(|e| format!("Download failed: {}", e))?;
            let status = response.status();
            if should_log_audio_clone {
                tracing::info!(
                    target: "group-audio",
                    "download_file http response msg_id={} status={} ok={}",
                    msg_id_clone,
                    status.as_u16(),
                    status.is_success(),
                );
            }
            if should_log_file_open_clone {
                tracing::warn!(
                    target: "file-open",
                    msg_id = %msg_id_clone,
                    status = status.as_u16(),
                    ok = status.is_success(),
                    "download_file http response"
                );
            }
            if should_log_video_menu_clone {
                eprintln!(
                    "[video-menu] download_file http response msg_id={} status={} ok={}",
                    msg_id_clone,
                    status.as_u16(),
                    status.is_success(),
                );
            }
            if !status.is_success() {
                let body = response
                    .text()
                    .await
                    .unwrap_or_else(|e| format!("read error body failed: {}", e));
                if should_log_video_menu_clone {
                    eprintln!(
                        "[video-menu] download_file http error msg_id={} status={} body_head={}",
                        msg_id_clone,
                        status.as_u16(),
                        body.chars().take(400).collect::<String>(),
                    );
                }
                return Err(format!(
                    "Download failed: HTTP {} body_head={}",
                    status.as_u16(),
                    body.chars().take(400).collect::<String>()
                ));
            }
            if let Some(parent) = path.parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("Create cache dir failed: {}", e))?;
            }

            let enc_path = path.with_extension("enc");
            // 上一次过期 URL / 解密失败可能留下半截 .enc，重试前先清掉，避免读到旧密文。
            let _ = tokio::fs::remove_file(&enc_path).await;
            let mut enc_file = tokio::fs::File::create(&enc_path)
                .await
                .map_err(|e| format!("Create encrypted file failed: {}", e))?;
            let total_bytes = response.content_length().unwrap_or(0);
            let mut downloaded_bytes = 0u64;
            let mut first_chunk_head: Vec<u8> = Vec::new();
            let mut last_emitted_progress = 0.0f64;
            let mut body_stream = response.bytes_stream();
            while let Some(chunk_result) = body_stream.next().await {
                let chunk = chunk_result.map_err(|e| format!("Read body failed: {}", e))?;
                if first_chunk_head.len() < 16 {
                    let remaining = 16 - first_chunk_head.len();
                    first_chunk_head.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
                }
                enc_file
                    .write_all(&chunk)
                    .await
                    .map_err(|e| format!("Write encrypted file failed: {}", e))?;
                downloaded_bytes += chunk.len() as u64;

                if total_bytes > 0 {
                    let progress = (downloaded_bytes as f64 / total_bytes as f64).min(1.0) * 0.85;
                    if progress - last_emitted_progress >= 0.02 {
                        last_emitted_progress = progress;
                        let _ = app_clone.emit(
                            &format!("file:progress:{}", msg_id_clone),
                            DownloadProgress {
                                msg_id: msg_id_clone.clone(),
                                progress,
                                total_bytes,
                                downloaded_bytes,
                                status: "downloading".to_string(),
                                data_url: None,
                                file_path: None,
                                is_dangerous: false,
                            },
                        );
                    }
                }
            }
            enc_file
                .flush()
                .await
                .map_err(|e| format!("Flush encrypted file failed: {}", e))?;
            drop(enc_file);
            if should_log_audio_clone {
                tracing::info!(
                    target: "group-audio",
                    "download_file http body msg_id={} encrypted_bytes={} encrypted_head_hex={}",
                    msg_id_clone,
                    downloaded_bytes,
                    bytes_head_hex(&first_chunk_head, 16),
                );
            }
            if should_log_video_menu_clone {
                eprintln!(
                    "[video-menu] download_file http body msg_id={} encrypted_bytes={} encrypted_head_hex={}",
                    msg_id_clone,
                    downloaded_bytes,
                    bytes_head_hex(&first_chunk_head, 16),
                );
            }

            if file_key.trim().is_empty() {
                tokio::fs::rename(&enc_path, &path)
                    .await
                    .map_err(|e| format!("Move downloaded file failed: {}", e))?;
                let (final_path, is_dangerous) = quarantine_dangerous_file(&path).await?;
                let meta = tokio::fs::metadata(&final_path)
                    .await
                    .map_err(|e| format!("Stat downloaded file failed: {}", e))?;
                if should_log_file_open_clone {
                    tracing::warn!(
                        target: "file-open",
                        msg_id = %msg_id_clone,
                        path = %final_path.to_string_lossy(),
                        bytes = meta.len(),
                        "download_file saved without decrypt"
                    );
                }
                return Ok::<(u64, Option<String>, PathBuf, bool), String>((
                    meta.len(),
                    None,
                    final_path,
                    is_dangerous,
                ));
            }

            if should_log_audio_clone {
                tracing::info!(
                    target: "group-audio",
                    "download_file decrypt start msg_id={} enc_path={} out_path={} file_key_head={} file_key_len={}",
                    msg_id_clone,
                    enc_path.to_string_lossy(),
                    path.to_string_lossy(),
                    file_key.chars().take(10).collect::<String>(),
                    file_key.len(),
                );
            }
            let _ = app_clone.emit(
                &format!("file:progress:{}", msg_id_clone),
                DownloadProgress {
                    msg_id: msg_id_clone.clone(),
                    progress: 0.9,
                    total_bytes: downloaded_bytes,
                    downloaded_bytes,
                    status: "decrypting".to_string(),
                    data_url: None,
                    file_path: None,
                    is_dangerous: false,
                },
            );
            crypto::file_crypto::decrypt_file(
                enc_path.to_str().unwrap_or_default(),
                path.to_str().unwrap_or_default(),
                &file_key,
            )
            .map_err(|e| format!("Decrypt failed: {}", e))?;

            let _ = tokio::fs::remove_file(&enc_path).await;
            let (final_path, is_dangerous) = quarantine_dangerous_file(&path).await?;
            let meta = tokio::fs::metadata(&final_path)
                .await
                .map_err(|e| format!("Stat failed: {}", e))?;
            if should_log_file_open_clone && !should_emit_data_url {
                tracing::warn!(
                    target: "file-open",
                    msg_id = %msg_id_clone,
                    path = %final_path.to_string_lossy(),
                    bytes = meta.len(),
                    "download_file decrypt done"
                );
            }
            let data_url = if should_emit_data_url {
                let decoded = tokio::fs::read(&final_path)
                    .await
                    .map_err(|e| format!("Read decrypted file failed: {}", e))?;
                if should_log_audio_clone {
                    tracing::info!(
                        target: "group-audio",
                        "download_file decrypt done msg_id={} decoded_bytes={} decoded_head_hex={}",
                        msg_id_clone,
                        decoded.len(),
                        bytes_head_hex(&decoded, 16),
                    );
                }
                if should_log_file_open_clone {
                    tracing::warn!(
                        target: "file-open",
                        msg_id = %msg_id_clone,
                        path = %final_path.to_string_lossy(),
                        bytes = decoded.len(),
                        head_hex = %bytes_head_hex(&decoded, 16),
                        "download_file decrypt done"
                    );
                }
                let mime = sniff_image_mime(&decoded);
                Some(format!(
                    "data:{};base64,{}",
                    mime,
                    general_purpose::STANDARD.encode(decoded)
                ))
            } else {
                None
            };
            Ok::<(u64, Option<String>, PathBuf, bool), String>((
                meta.len(),
                data_url,
                final_path,
                is_dangerous,
            ))
        }
        .await;

        match download_result {
            Ok((size, data_url, final_path, is_dangerous)) => {
                if should_log_audio_clone {
                    tracing::info!(
                        target: "group-audio",
                        "download_file emit done msg_id={} size={}",
                        msg_id_clone,
                        size,
                    );
                }
                if should_log_file_open_clone {
                    tracing::warn!(
                        target: "file-open",
                        msg_id = %msg_id_clone,
                        size = size,
                        has_data_url = data_url.is_some(),
                        file_path = %final_path.to_string_lossy(),
                        is_dangerous = is_dangerous,
                        "download_file emit done"
                    );
                }
                let _ = app_clone.emit(
                    &format!("file:done:{}", msg_id_clone),
                    DownloadProgress {
                        msg_id: msg_id_clone,
                        progress: 1.0,
                        total_bytes: size,
                        downloaded_bytes: size,
                        status: "done".to_string(),
                        data_url,
                        file_path: Some(final_path.to_string_lossy().to_string()),
                        is_dangerous,
                    },
                );
            }
            Err(e) => {
                let _ = tokio::fs::remove_file(path.with_extension("enc")).await;
                if should_log_audio_clone {
                    tracing::error!(
                        target: "group-audio",
                        "download_file emit error msg_id={} error={}",
                        msg_id_clone,
                        e,
                    );
                }
                if should_log_file_open_clone {
                    tracing::error!(
                        target: "file-open",
                        msg_id = %msg_id_clone,
                        error = %e,
                        "download_file emit error"
                    );
                }
                let _ = app_clone.emit(
                    &format!("file:error:{}", msg_id_clone),
                    serde_json::json!({ "error": e }),
                );
            }
        }
        if let Ok(mut active) = active_downloads().lock() {
            active.remove(&download_key);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn get_download_progress(msg_id: String) -> Result<DownloadProgress, String> {
    Ok(DownloadProgress {
        msg_id,
        progress: 0.0,
        total_bytes: 0,
        downloaded_bytes: 0,
        status: "idle".to_string(),
        data_url: None,
        file_path: None,
        is_dangerous: false,
    })
}

#[tauri::command]
pub async fn save_base64_image(file_path: String, base64_data: String) -> Result<(), String> {
    let mut payload = base64_data.trim().to_string();
    if let Some(idx) = payload.find(',') {
        payload = payload[idx + 1..].to_string();
    }

    let bytes = general_purpose::STANDARD
        .decode(payload)
        .map_err(|e| format!("decode base64 failed: {}", e))?;

    let path = PathBuf::from(file_path);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("create parent dir failed: {}", e))?;
    }

    tokio::fs::write(path, bytes)
        .await
        .map_err(|e| format!("write image file failed: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn copy_file_overwrite(source_path: String, target_path: String) -> Result<(), String> {
    let source = PathBuf::from(&source_path);
    if !source.is_file() {
        return Err(format!("source file not found: {}", source_path));
    }

    let target = PathBuf::from(&target_path);
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("create parent dir failed: {}", e))?;
    }

    tokio::fs::copy(&source, &target)
        .await
        .map_err(|e| format!("copy file failed: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    Ok(tokio::fs::metadata(PathBuf::from(path)).await.is_ok())
}

#[tauri::command]
pub async fn reveal_file_in_directory(path: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    if !file_path.is_file() {
        return Err(format!("file not found: {}", path));
    }

    #[cfg(target_os = "macos")]
    {
        let reveal_status = Command::new("open")
            .arg("-R")
            .arg(&file_path)
            .status()
            .map_err(|e| format!("reveal file failed: {}", e))?;
        if !reveal_status.success() {
            return Err(format!("reveal file failed with status: {}", reveal_status));
        }

        let activate_status = Command::new("open")
            .arg("-a")
            .arg("Finder")
            .status()
            .map_err(|e| format!("activate Finder failed: {}", e))?;
        if activate_status.success() {
            return Ok(());
        }
        return Err(format!(
            "activate Finder failed with status: {}",
            activate_status
        ));
    }

    #[cfg(target_os = "windows")]
    {
        hidden_windows_command("explorer.exe")
            .arg(format!("/select,{}", file_path.to_string_lossy()))
            .spawn()
            .map_err(|e| format!("reveal file failed: {}", e))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let directory = file_path
            .parent()
            .ok_or_else(|| format!("directory not found for file: {}", path))?;
        Command::new("xdg-open")
            .arg(directory)
            .spawn()
            .map_err(|e| format!("open directory failed: {}", e))?;
        Ok(())
    }
}

#[tauri::command]
pub async fn open_file(path: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    if !file_path.is_file() {
        return Err(format!("file not found: {}", path));
    }

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg(&file_path)
            .status()
            .map_err(|e| format!("open file failed: {}", e))?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("open file failed with status: {}", status));
    }

    #[cfg(target_os = "windows")]
    {
        hidden_windows_command("explorer.exe")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("open file failed: {}", e))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Command::new("xdg-open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("open file failed: {}", e))?;
        Ok(())
    }
}

#[tauri::command]
pub async fn open_in_browser(target: String) -> Result<(), String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("browser target is empty".to_string());
    }

    tracing::warn!(
        target: "file-open",
        open_target = %trimmed,
        target_kind = classify_browser_open_target(trimmed),
        "open_in_browser start"
    );

    #[cfg(target_os = "macos")]
    {
        match Command::new("open")
            .arg("-a")
            .arg("Google Chrome")
            .arg(trimmed)
            .status()
        {
            Ok(status) => {
                tracing::warn!(
                    target: "file-open",
                    command = "open -a Google Chrome",
                    open_target = %trimmed,
                    success = status.success(),
                    code = ?status.code(),
                    "open_in_browser command result"
                );
                if status.success() {
                    return Ok(());
                }
            }
            Err(error) => {
                tracing::warn!(
                    target: "file-open",
                    command = "open -a Google Chrome",
                    open_target = %trimmed,
                    error = %error,
                    "open_in_browser command spawn failed"
                );
            }
        }

        let status = Command::new("open")
            .arg(trimmed)
            .status()
            .map_err(|e| format!("open browser failed: {}", e))?;
        tracing::warn!(
            target: "file-open",
            command = "open",
            open_target = %trimmed,
            success = status.success(),
            code = ?status.code(),
            "open_in_browser fallback command result"
        );
        if status.success() {
            return Ok(());
        }
        return Err(format!("open browser failed with status: {}", status));
    }

    #[cfg(target_os = "windows")]
    {
        match hidden_windows_command("cmd")
            .args(["/C", "start", "", "chrome"])
            .arg(trimmed)
            .status()
        {
            Ok(status) => {
                tracing::warn!(
                    target: "file-open",
                    command = "cmd /C start chrome",
                    open_target = %trimmed,
                    success = status.success(),
                    code = ?status.code(),
                    "open_in_browser command result"
                );
                if status.success() {
                    return Ok(());
                }
            }
            Err(error) => {
                tracing::warn!(
                    target: "file-open",
                    command = "cmd /C start chrome",
                    open_target = %trimmed,
                    error = %error,
                    "open_in_browser command spawn failed"
                );
            }
        }

        let child = hidden_windows_command("cmd")
            .args(["/C", "start", ""])
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("open browser failed: {}", e))?;
        tracing::warn!(
            target: "file-open",
            command = "cmd /C start",
            open_target = %trimmed,
            pid = child.id(),
            "open_in_browser fallback spawned"
        );
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        match Command::new("google-chrome").arg(trimmed).status() {
            Ok(status) => {
                tracing::warn!(
                    target: "file-open",
                    command = "google-chrome",
                    open_target = %trimmed,
                    success = status.success(),
                    code = ?status.code(),
                    "open_in_browser command result"
                );
                if status.success() {
                    return Ok(());
                }
            }
            Err(error) => {
                tracing::warn!(
                    target: "file-open",
                    command = "google-chrome",
                    open_target = %trimmed,
                    error = %error,
                    "open_in_browser command spawn failed"
                );
            }
        }

        let child = Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("open browser failed: {}", e))?;
        tracing::warn!(
            target: "file-open",
            command = "xdg-open",
            open_target = %trimmed,
            pid = child.id(),
            "open_in_browser fallback spawned"
        );
        Ok(())
    }
}

fn classify_browser_open_target(target: &str) -> &'static str {
    let lower = target.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return "remote-url";
    }
    if lower.starts_with("file:") {
        return "file-url";
    }
    if target.starts_with('/') || looks_like_windows_path(target) {
        return "local-path";
    }
    "unknown"
}

fn looks_like_windows_path(target: &str) -> bool {
    let bytes = target.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
}
