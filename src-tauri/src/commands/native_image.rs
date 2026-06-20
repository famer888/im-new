use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::Manager;
use tokio::sync::{Mutex as AsyncMutex, Semaphore};
use tracing::{info, warn};

use crate::crypto;

const STATE_READY: &str = "ready";
const STATE_DOWNLOAD_ERROR: &str = "downloadError";
const STATE_DECRYPT_ERROR: &str = "decryptError";
const ERROR_HTTP: &str = "httpError";
const ERROR_NETWORK: &str = "network";
const ERROR_INVALID_IMAGE: &str = "invalidImage";
const ERROR_DECRYPT_FAILED: &str = "decryptFailed";
const ERROR_IO: &str = "io";

// 前端 TextAvatar 只暴露头像语义，真实下载/解密/缓存都收敛到这一个 Tauri command。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveNativeImageRequest {
    pub scope_kind: String,
    pub scope_id: String,
    pub sub: Option<String>,
    pub resource_key: String,
    pub url: String,
    pub candidate_urls: Option<Vec<String>>,
    pub encrypt_key: Option<String>,
}

// 返回本地文件路径而不是 data URL：Tauri 端统一用 convertFileSrc 展示，避免大头像走 base64 占内存。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveNativeImageResponse {
    pub state: String,
    pub local_path: Option<String>,
    pub mime: Option<String>,
    pub from_cache: bool,
    pub error_code: Option<String>,
}

// 缓存元数据记录资源 key 和源 URL 指纹；头像地址参数变化时要重新拉取，避免群头像更新后继续命中旧文件。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeImageMeta {
    source_url_hash: String,
    scope_kind: String,
    scope_id: String,
    sub: Option<String>,
    resource_key: String,
    local_file: String,
    mime: String,
}

#[derive(Debug, Clone)]
struct ImageMagic {
    mime: &'static str,
    extension: &'static str,
}

#[derive(Debug)]
struct PipelineError {
    state: &'static str,
    code: &'static str,
    message: String,
}

impl PipelineError {
    fn download(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            state: STATE_DOWNLOAD_ERROR,
            code,
            message: message.into(),
        }
    }

    fn decrypt(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            state: STATE_DECRYPT_ERROR,
            code,
            message: message.into(),
        }
    }
}

type InflightMap = HashMap<String, Arc<AsyncMutex<()>>>;

// 进程内并发合并表：同一头像同时出现在会话列表/头部/成员列表时，只允许一个下载任务落盘。
static INFLIGHT_NATIVE_IMAGES: OnceLock<Mutex<InflightMap>> = OnceLock::new();
static NATIVE_IMAGE_DOWNLOAD_LIMIT: OnceLock<Arc<Semaphore>> = OnceLock::new();

// 返回头像下载并发限制器，统一控制列表/成员面板同时触发的远程头像请求数量。
fn download_limit() -> &'static Arc<Semaphore> {
    // 对齐旧 NativeImage 头像并发上限，避免线上 mac 包一次性拉几十个头像把网络队列拖慢。
    NATIVE_IMAGE_DOWNLOAD_LIMIT.get_or_init(|| Arc::new(Semaphore::new(8)))
}

fn inflight_map() -> &'static Mutex<InflightMap> {
    INFLIGHT_NATIVE_IMAGES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn inflight_lock(cache_key: &str) -> Result<Arc<AsyncMutex<()>>, String> {
    let mut map = inflight_map()
        .lock()
        .map_err(|_| "native image inflight lock poisoned".to_string())?;
    Ok(map
        .entry(cache_key.to_string())
        .or_insert_with(|| Arc::new(AsyncMutex::new(())))
        .clone())
}

fn release_inflight_lock(cache_key: &str, lock: &Arc<AsyncMutex<()>>) {
    if let Ok(mut map) = inflight_map().lock() {
        if map
            .get(cache_key)
            .map(|current| Arc::ptr_eq(current, lock))
            .unwrap_or(false)
        {
            map.remove(cache_key);
        }
    }
}

fn sha1_hex(input: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

fn cache_hash(req: &ResolveNativeImageRequest) -> String {
    // cache key 只取 scope + resourceKey；前端可通过 resourceKey 决定同一路径复用还是换头像版本。
    sha1_hex(&format!(
        "{}|{}|{}",
        req.scope_kind.trim(),
        req.sub.as_deref().unwrap_or("").trim(),
        req.resource_key.trim()
    ))
}

fn cache_dir_for(root: &Path, req: &ResolveNativeImageRequest) -> PathBuf {
    let scope = req.scope_kind.trim();
    root.join(if scope.is_empty() { "avatar" } else { scope })
        .join(cache_hash(req))
}

fn meta_path(cache_dir: &Path) -> PathBuf {
    cache_dir.join("meta.json")
}

fn source_url_hash(req: &ResolveNativeImageRequest) -> String {
    // 同一个 resourceKey 下忽略签名 query 轮换；群头像若要按 query 刷新，会在前端把 query 纳入 resourceKey。
    sha1_hex(strip_url_query(req.url.trim()))
}

// 去掉 URL query，只保留稳定路径用于头像缓存指纹。
fn strip_url_query(url: &str) -> &str {
    url.split_once('?').map(|(path, _)| path).unwrap_or(url)
}

fn response_from_meta(
    cache_dir: &Path,
    req: &ResolveNativeImageRequest,
) -> Option<ResolveNativeImageResponse> {
    // 缓存命中必须同时有 meta 和实体文件；任何一边缺失都回到下载流程自愈。
    let text = std::fs::read_to_string(meta_path(cache_dir)).ok()?;
    let meta: NativeImageMeta = serde_json::from_str(&text).ok()?;
    if meta.resource_key != req.resource_key {
        return None;
    }
    // 同一 resourceKey 下 URL path 变化通常代表头像版本变化，需要重新下载覆盖旧缓存。
    if meta.source_url_hash != source_url_hash(req) {
        return None;
    }
    let path = cache_dir.join(meta.local_file);
    if !path.is_file() {
        return None;
    }
    Some(ResolveNativeImageResponse {
        state: STATE_READY.to_string(),
        local_path: Some(path.to_string_lossy().to_string()),
        mime: Some(meta.mime),
        from_cache: true,
        error_code: None,
    })
}

fn collect_candidate_urls(req: &ResolveNativeImageRequest) -> Vec<String> {
    let mut urls = Vec::new();
    // 原 URL 永远放第一位，再接前端按旧 im ossDefaultUrl 规则生成的候选域名，保持旧项目优先级。
    for url in std::iter::once(&req.url).chain(req.candidate_urls.as_deref().unwrap_or(&[])) {
        let normalized = url.trim();
        if normalized.is_empty() || !normalized.starts_with("http") {
            continue;
        }
        if !urls.iter().any(|item: &String| item == normalized) {
            urls.push(normalized.to_string());
        }
    }
    urls
}

fn sniff_image_magic(bytes: &[u8]) -> Option<ImageMagic> {
    // 旧 NativeImage 用文件头判断“明文图还是密文”；命中常见图片 magic 就跳过解密。
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Some(ImageMagic {
            mime: "image/png",
            extension: "png",
        });
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some(ImageMagic {
            mime: "image/jpeg",
            extension: "jpg",
        });
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some(ImageMagic {
            mime: "image/gif",
            extension: "gif",
        });
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some(ImageMagic {
            mime: "image/webp",
            extension: "webp",
        });
    }
    if bytes.starts_with(b"BM") {
        return Some(ImageMagic {
            mime: "image/bmp",
            extension: "bmp",
        });
    }
    if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" {
        return Some(ImageMagic {
            mime: "image/heic",
            extension: "heic",
        });
    }
    None
}

async fn download_candidate(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, PipelineError> {
    // 头像下载不复用 download_file，避免触发消息附件的 progress/done/error 事件和危险文件逻辑。
    let response =
        client.get(url).send().await.map_err(|e| {
            PipelineError::download(ERROR_NETWORK, format!("request failed: {}", e))
        })?;
    let status = response.status();
    if !status.is_success() {
        return Err(PipelineError::download(
            ERROR_HTTP,
            format!("http status {}", status.as_u16()),
        ));
    }
    response
        .bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| PipelineError::download(ERROR_NETWORK, format!("read body failed: {}", e)))
}

fn decrypt_native_image_bytes(bytes: &[u8], key: &str) -> Result<Vec<u8>, PipelineError> {
    if key.trim().is_empty() {
        return Err(PipelineError::decrypt(
            ERROR_INVALID_IMAGE,
            "image is not plain and encryptKey is empty",
        ));
    }

    // 头像历史数据有两种格式：PC 分块加密与移动端整文件加密；复用文件解密探测避免大头像被误按 102416 分块拆开。
    crypto::file_crypto::decrypt_file_bytes(bytes, key)
        .map_err(|e| PipelineError::decrypt(ERROR_DECRYPT_FAILED, format!("decrypt failed: {}", e)))
}

async fn write_ready_cache(
    cache_dir: &Path,
    req: &ResolveNativeImageRequest,
    bytes: &[u8],
    magic: &ImageMagic,
) -> Result<ResolveNativeImageResponse, PipelineError> {
    // 先写临时文件再 rename，防止进程退出或下载失败留下半成品被后续缓存命中。
    tokio::fs::create_dir_all(cache_dir)
        .await
        .map_err(|e| PipelineError::decrypt(ERROR_IO, format!("create cache dir failed: {}", e)))?;
    let local_file = format!("image.{}", magic.extension);
    let final_path = cache_dir.join(&local_file);
    let tmp_path = cache_dir.join(format!("{}.tmp", uuid::Uuid::new_v4()));
    tokio::fs::write(&tmp_path, bytes)
        .await
        .map_err(|e| PipelineError::decrypt(ERROR_IO, format!("write tmp image failed: {}", e)))?;
    tokio::fs::rename(&tmp_path, &final_path)
        .await
        .map_err(|e| PipelineError::decrypt(ERROR_IO, format!("commit image failed: {}", e)))?;

    let meta = NativeImageMeta {
        source_url_hash: source_url_hash(req),
        scope_kind: req.scope_kind.clone(),
        scope_id: req.scope_id.clone(),
        sub: req.sub.clone(),
        resource_key: req.resource_key.clone(),
        local_file,
        mime: magic.mime.to_string(),
    };
    let meta_text = serde_json::to_string_pretty(&meta)
        .map_err(|e| PipelineError::decrypt(ERROR_IO, format!("serialize meta failed: {}", e)))?;
    tokio::fs::write(meta_path(cache_dir), meta_text)
        .await
        .map_err(|e| PipelineError::decrypt(ERROR_IO, format!("write meta failed: {}", e)))?;

    Ok(ResolveNativeImageResponse {
        state: STATE_READY.to_string(),
        local_path: Some(final_path.to_string_lossy().to_string()),
        mime: Some(magic.mime.to_string()),
        from_cache: false,
        error_code: None,
    })
}

async fn run_native_image_pipeline(
    cache_root: &Path,
    req: &ResolveNativeImageRequest,
    client: &reqwest::Client,
) -> Result<ResolveNativeImageResponse, PipelineError> {
    let cache_dir = cache_dir_for(cache_root, req);
    // NativeImage 的第一目标是减少重复远程加载；缓存可用时直接返回本地路径。
    if let Some(cached) = response_from_meta(&cache_dir, req) {
        return Ok(cached);
    }

    let _permit = download_limit()
        .clone()
        .acquire_owned()
        .await
        .map_err(|e| {
            PipelineError::download(ERROR_NETWORK, format!("download limiter closed: {}", e))
        })?;

    // 排队等待期间可能已有同 key 请求写好缓存，真正下载前再查一次，减少重复网络请求。
    if let Some(cached) = response_from_meta(&cache_dir, req) {
        return Ok(cached);
    }

    let candidates = collect_candidate_urls(req);
    if candidates.is_empty() {
        return Err(PipelineError::download(
            ERROR_NETWORK,
            "missing http candidate url",
        ));
    }

    let mut last_download_error: Option<PipelineError> = None;
    for candidate in candidates {
        match download_candidate(client, &candidate).await {
            Ok(downloaded) => {
                if let Some(magic) = sniff_image_magic(&downloaded) {
                    // 旧项目支持新老头像混存：明文图片即使带了 encryptKey，也直接提交缓存。
                    return write_ready_cache(&cache_dir, req, &downloaded, &magic).await;
                }
                let key = req.encrypt_key.as_deref().unwrap_or("");
                // 文件头不像明文图时才尝试 AES 解密；解密后仍要再验 magic，避免错 key 写入坏缓存。
                let decrypted = decrypt_native_image_bytes(&downloaded, key)?;
                let Some(magic) = sniff_image_magic(&decrypted) else {
                    return Err(PipelineError::decrypt(
                        ERROR_INVALID_IMAGE,
                        "decrypted bytes are not a supported image",
                    ));
                };
                return write_ready_cache(&cache_dir, req, &decrypted, &magic).await;
            }
            Err(err) => {
                warn!(
                    "native image candidate failed scope={} key={} url_head={} err={}",
                    req.scope_kind,
                    req.resource_key,
                    candidate.chars().take(120).collect::<String>(),
                    err.message
                );
                last_download_error = Some(err);
            }
        }
    }

    Err(last_download_error
        .unwrap_or_else(|| PipelineError::download(ERROR_NETWORK, "all candidates failed")))
}

async fn resolve_native_image_in_dir(
    cache_root: PathBuf,
    req: ResolveNativeImageRequest,
    client: reqwest::Client,
) -> ResolveNativeImageResponse {
    let cache_key = cache_hash(&req);
    let Ok(lock) = inflight_lock(&cache_key) else {
        return ResolveNativeImageResponse {
            state: STATE_DOWNLOAD_ERROR.to_string(),
            local_path: None,
            mime: None,
            from_cache: false,
            error_code: Some(ERROR_IO.to_string()),
        };
    };

    // 同一头像在列表、头部、成员面板会重复出现；这里合并并发下载，避免相同资源同时落盘。
    let result = {
        let _guard = lock.lock().await;
        run_native_image_pipeline(&cache_root, &req, &client).await
    };
    release_inflight_lock(&cache_key, &lock);

    match result {
        Ok(response) => {
            info!(
                "native image resolved scope={} key={} from_cache={}",
                req.scope_kind, req.resource_key, response.from_cache
            );
            response
        }
        Err(err) => {
            warn!(
                "native image resolve failed scope={} key={} state={} code={} err={}",
                req.scope_kind, req.resource_key, err.state, err.code, err.message
            );
            ResolveNativeImageResponse {
                state: err.state.to_string(),
                local_path: None,
                mime: None,
                from_cache: false,
                error_code: Some(err.code.to_string()),
            }
        }
    }
}

#[tauri::command]
pub async fn resolve_native_image(
    app: tauri::AppHandle,
    request: ResolveNativeImageRequest,
) -> Result<ResolveNativeImageResponse, String> {
    // 缓存放在 app data 下，mac/Windows 都由 Tauri 解析真实用户数据目录，避免手写平台路径。
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir failed: {}", e))?;
    let cache_root = app_data_dir.join("native-image");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| format!("create native image client failed: {}", e))?;
    Ok(resolve_native_image_in_dir(cache_root, request, client).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    static TEST_DIR_COUNTER: AtomicUsize = AtomicUsize::new(0);

    const TEST_KEY: &str = "f58c15f54e8f7826";
    const PNG_BYTES: &[u8] = &[
        0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, b'I', b'H', b'D', b'R', 0, 0,
        0, 1, 0, 0, 0, 1,
    ];

    fn test_cache_root(name: &str) -> PathBuf {
        let n = TEST_DIR_COUNTER.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!(
            "ocs-native-image-test-{}-{}-{}",
            std::process::id(),
            name,
            n
        ));
        let _ = std::fs::remove_dir_all(&path);
        path
    }

    fn request_for(url: String, resource_key: &str) -> ResolveNativeImageRequest {
        ResolveNativeImageRequest {
            scope_kind: "avatar".to_string(),
            scope_id: "100".to_string(),
            sub: Some("friend".to_string()),
            resource_key: resource_key.to_string(),
            url,
            candidate_urls: None,
            encrypt_key: Some(TEST_KEY.to_string()),
        }
    }

    async fn serve_once(status: u16, body: Vec<u8>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let Ok((mut socket, _)) = listener.accept().await else {
                return;
            };
            let mut buf = [0u8; 1024];
            let _ = socket.read(&mut buf).await;
            let reason = if status == 200 { "OK" } else { "ERR" };
            let response = format!(
                "HTTP/1.1 {} {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                status,
                reason,
                body.len()
            );
            let _ = socket.write_all(response.as_bytes()).await;
            let _ = socket.write_all(&body).await;
        });
        format!("http://{}", addr)
    }

    async fn serve_counted(body: Vec<u8>, counter: Arc<AtomicUsize>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    break;
                };
                counter.fetch_add(1, Ordering::SeqCst);
                let body = body.clone();
                tokio::spawn(async move {
                    let mut buf = [0u8; 1024];
                    let _ = socket.read(&mut buf).await;
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    let _ = socket.write_all(response.as_bytes()).await;
                    let _ = socket.write_all(&body).await;
                });
            }
        });
        format!("http://{}", addr)
    }

    #[test]
    fn cache_identity_ignores_source_query_when_resource_key_is_stable() {
        let req_a = request_for("https://example.test/a.png?x=1".to_string(), "stable-key");
        let req_b = request_for("https://example.test/a.png?x=2".to_string(), "stable-key");
        assert_eq!(cache_hash(&req_a), cache_hash(&req_b));
        assert_eq!(source_url_hash(&req_a), source_url_hash(&req_b));
    }

    #[tokio::test]
    async fn plain_png_resolves_and_hits_cache() {
        let url = serve_once(200, PNG_BYTES.to_vec()).await;
        let root = test_cache_root("plain");
        let req = request_for(url, "plain-key");
        let client = reqwest::Client::new();

        let first = resolve_native_image_in_dir(root.clone(), req.clone(), client.clone()).await;
        assert_eq!(first.state, STATE_READY);
        assert!(!first.from_cache);
        assert_eq!(first.mime.as_deref(), Some("image/png"));

        let second = resolve_native_image_in_dir(root.clone(), req, client).await;
        assert_eq!(second.state, STATE_READY);
        assert!(second.from_cache);
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn same_resource_key_reuses_cache_when_only_source_query_changes() {
        let url_a = serve_once(200, PNG_BYTES.to_vec()).await;
        let root = test_cache_root("source-url-refresh");
        let client = reqwest::Client::new();

        let first = resolve_native_image_in_dir(
            root.clone(),
            request_for(format!("{}?v=1", url_a), "same-avatar-key"),
            client.clone(),
        )
        .await;
        assert_eq!(first.state, STATE_READY);
        assert!(!first.from_cache);

        let second = resolve_native_image_in_dir(
            root.clone(),
            request_for(format!("{}?v=2", url_a), "same-avatar-key"),
            client,
        )
        .await;
        assert_eq!(second.state, STATE_READY);
        assert!(second.from_cache);
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn encrypted_avatar_resolves_after_decrypt() {
        let encrypted = crypto::aes::encrypt_message(PNG_BYTES, TEST_KEY).unwrap();
        let url = serve_once(200, encrypted).await;
        let root = test_cache_root("encrypted");
        let req = request_for(url, "encrypted-key");

        let result = resolve_native_image_in_dir(root.clone(), req, reqwest::Client::new()).await;
        assert_eq!(result.state, STATE_READY);
        assert_eq!(result.mime.as_deref(), Some("image/png"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn whole_file_encrypted_large_avatar_resolves_after_decrypt() {
        let mut plain = PNG_BYTES.to_vec();
        plain.resize(crypto::file_crypto::DECRYPT_CHUNK_SIZE + 4096, 0x42);
        let encrypted = crypto::aes::encrypt_message(&plain, TEST_KEY).unwrap();
        let url = serve_once(200, encrypted).await;
        let root = test_cache_root("whole-file-encrypted-large");
        let req = request_for(url, "whole-file-encrypted-large-key");

        let result = resolve_native_image_in_dir(root.clone(), req, reqwest::Client::new()).await;
        assert_eq!(result.state, STATE_READY);
        assert_eq!(result.mime.as_deref(), Some("image/png"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn candidate_fallback_uses_second_url() {
        let bad_url = serve_once(404, b"missing".to_vec()).await;
        let good_url = serve_once(200, PNG_BYTES.to_vec()).await;
        let root = test_cache_root("candidate");
        let mut req = request_for(bad_url.clone(), "candidate-key");
        req.candidate_urls = Some(vec![bad_url, good_url]);

        let result = resolve_native_image_in_dir(root.clone(), req, reqwest::Client::new()).await;
        assert_eq!(result.state, STATE_READY);
        assert_eq!(result.mime.as_deref(), Some("image/png"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn concurrent_resolve_shares_single_download() {
        let counter = Arc::new(AtomicUsize::new(0));
        let url = serve_counted(PNG_BYTES.to_vec(), counter.clone()).await;
        let root = test_cache_root("concurrent");
        let req = request_for(url, "concurrent-key");
        let client = reqwest::Client::new();

        let (a, b) = tokio::join!(
            resolve_native_image_in_dir(root.clone(), req.clone(), client.clone()),
            resolve_native_image_in_dir(root.clone(), req, client)
        );

        assert_eq!(a.state, STATE_READY);
        assert_eq!(b.state, STATE_READY);
        assert_eq!(counter.load(Ordering::SeqCst), 1);
        let _ = std::fs::remove_dir_all(root);
    }
}
