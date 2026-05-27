use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainItem {
    pub domain: String,
    pub status: String,
    pub module_code: String,
    pub source: Option<String>,
    pub priority: Option<u32>,
    pub last_check: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeUrlResult {
    pub status: u16,
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProxyHttpPurpose {
    DomainApi,
    OssSeed,
    Diagnostic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyHttpRequest {
    pub url: String,
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub purpose: ProxyHttpPurpose,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyHttpResponse {
    pub ok: bool,
    pub status: u16,
    pub body: String,
    pub error: Option<String>,
}

pub struct DomainPoolState {
    pub domains: Mutex<Vec<DomainItem>>,
}

impl DomainPoolState {
    pub fn new() -> Self {
        Self {
            domains: Mutex::new(Vec::new()),
        }
    }
}

#[tauri::command]
pub fn get_domain_pool(state: State<'_, DomainPoolState>) -> Vec<DomainItem> {
    state.domains.lock().unwrap().clone()
}

#[tauri::command]
pub fn update_domain_pool(state: State<'_, DomainPoolState>, domains: Vec<DomainItem>) {
    let mut pool = state.domains.lock().unwrap();
    *pool = domains;
}

#[tauri::command]
pub fn mark_domain_error(state: State<'_, DomainPoolState>, module_code: String, domain: String) {
    let mut pool = state.domains.lock().unwrap();
    if let Some(item) = pool
        .iter_mut()
        .find(|d| d.module_code == module_code && d.domain == domain)
    {
        item.status = "error".to_string();
    }
}

#[tauri::command]
pub fn get_first_normal_domain(
    state: State<'_, DomainPoolState>,
    module_code: String,
) -> Option<String> {
    let pool = state.domains.lock().unwrap();
    pool.iter()
        .find(|d| d.module_code == module_code && d.status == "normal")
        .or_else(|| pool.iter().find(|d| d.module_code == module_code))
        .map(|d| d.domain.clone())
}

fn parse_http_url(url: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(url.trim()).map_err(|e| format!("invalid url: {}", e))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("unsupported url scheme".to_string());
    }
    Ok(parsed)
}

fn normalize_http_method(method: Option<&str>) -> String {
    method.unwrap_or("GET").trim().to_uppercase()
}

fn timeout_for_proxy_purpose(purpose: &ProxyHttpPurpose) -> Duration {
    match purpose {
        ProxyHttpPurpose::DomainApi => Duration::from_secs(10),
        ProxyHttpPurpose::OssSeed => Duration::from_secs(12),
        ProxyHttpPurpose::Diagnostic => Duration::from_secs(5),
    }
}

fn ensure_proxy_method_allowed(purpose: &ProxyHttpPurpose, method: &str) -> Result<(), String> {
    // 受控代发只放行每个用途必须的方法，避免演变成任意 HTTP 透传入口。
    let allowed = match purpose {
        ProxyHttpPurpose::DomainApi => matches!(method, "POST"),
        ProxyHttpPurpose::OssSeed => matches!(method, "GET"),
        ProxyHttpPurpose::Diagnostic => matches!(method, "GET" | "HEAD"),
    };
    if !allowed {
        return Err(format!(
            "method {} is not allowed for purpose {:?}",
            method, purpose
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn proxy_http_text(request: ProxyHttpRequest) -> Result<ProxyHttpResponse, String> {
    let parsed = parse_http_url(&request.url)?;
    let method = normalize_http_method(request.method.as_deref());
    ensure_proxy_method_allowed(&request.purpose, &method)?;

    let reqwest_method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|e| format!("invalid method {}: {}", method, e))?;
    let client = reqwest::Client::builder()
        .timeout(timeout_for_proxy_purpose(&request.purpose))
        .build()
        .map_err(|e| format!("create http client failed: {}", e))?;

    let mut req = client.request(reqwest_method.clone(), parsed);
    if let Some(headers) = request.headers {
        for (key, value) in headers {
            let header_key = key.trim();
            if header_key.is_empty() {
                continue;
            }
            req = req.header(header_key, value);
        }
    }
    if matches!(reqwest_method, reqwest::Method::POST | reqwest::Method::PUT | reqwest::Method::PATCH)
    {
        if let Some(body) = request.body {
            req = req.body(body);
        }
    }

    let response = req
        .send()
        .await
        .map_err(|e| format!("proxy http request failed: {}", e))?;
    let status = response.status().as_u16();
    let body = if method == "HEAD" {
        String::new()
    } else {
        response
            .text()
            .await
            .map_err(|e| format!("read response text failed: {}", e))?
    };
    let ok = (200..300).contains(&status);

    Ok(ProxyHttpResponse {
        ok,
        status,
        body,
        error: if ok {
            None
        } else {
            Some(format!("proxy request failed: HTTP {}", status))
        },
    })
}

/// Tauri 没有 Electron session.webRequest CORS hook；OSS/动态域名引导统一走主进程 reqwest 拉取，避免 WebView CORS 拦截。
#[tauri::command]
pub async fn fetch_url_text(url: String) -> Result<String, String> {
    let mut headers = HashMap::new();
    headers.insert(
        "Accept".to_string(),
        "text/plain,application/json,*/*".to_string(),
    );
    let result = proxy_http_text(ProxyHttpRequest {
        url,
        method: Some("GET".to_string()),
        headers: Some(headers),
        body: None,
        purpose: ProxyHttpPurpose::OssSeed,
    })
    .await?;
    if !result.ok {
        return Err(
            result
                .error
                .unwrap_or_else(|| format!("fetch url failed: HTTP {}", result.status)),
        );
    }
    Ok(result.body)
}

/// 上传前动态域名探活走主进程，避免 WebView CORS 干扰；能连通且非 5xx 即视为可尝试上传。
#[tauri::command]
pub async fn probe_url(url: String) -> Result<ProbeUrlResult, String> {
    // 先用 HEAD 减少探活成本；若目标服务不支持 HEAD，再回退 GET 保持兼容旧行为。
    let head_result = proxy_http_text(ProxyHttpRequest {
        url: url.clone(),
        method: Some("HEAD".to_string()),
        headers: None,
        body: None,
        purpose: ProxyHttpPurpose::Diagnostic,
    })
    .await;

    let status = match head_result {
        Ok(result) => result.status,
        Err(_) => {
            let fallback_result = proxy_http_text(ProxyHttpRequest {
                url,
                method: Some("GET".to_string()),
                headers: None,
                body: None,
                purpose: ProxyHttpPurpose::Diagnostic,
            })
            .await
            .map_err(|e| format!("probe url failed: {}", e))?;
            fallback_result.status
        }
    };
    Ok(ProbeUrlResult {
        status,
        ok: status < 500,
    })
}
