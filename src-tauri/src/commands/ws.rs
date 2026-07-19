use tauri::State;

use crate::ws::{WsLoginClientInfo, WsManager};

fn normalize_ws_url(url: &str) -> String {
    let trimmed = url.trim();
    // 兼容旧前端缓存：生产 webSession 的 443 端口必须按 TLS WebSocket 连接，否则会出现 invalid HTTP version。
    if trimmed.starts_with("ws://") {
        let without_scheme = &trimmed["ws://".len()..];
        if without_scheme
            .split('/')
            .next()
            .is_some_and(|host| host.ends_with(":443"))
        {
            return format!("wss://{}", without_scheme);
        }
    }
    trimmed.to_string()
}

#[tauri::command]
pub async fn connect_ws(
    ws_mgr: State<'_, WsManager>,
    url: String,
    aes_key: String,
    session_id: Option<String>,
    install_code: Option<String>,
    uid: Option<String>,
    app_ver: Option<i32>,
    package_code: Option<i32>,
    plat: Option<i32>,
    language: Option<i32>,
    sys_mac: Option<String>,
    sys_model: Option<String>,
) -> Result<(), String> {
    let url = normalize_ws_url(&url);
    let session_id = session_id.map(|value| value.trim().to_string());
    let uid = uid.map(|value| value.trim().to_string());
    // 10001 登录包没有 sessionId/uid 会被服务端直接拒绝；禁止启动这种空登录重连循环。
    if session_id.as_deref().unwrap_or_default().is_empty()
        || uid.as_deref().unwrap_or_default().is_empty()
    {
        return Err("missing websocket login session".to_string());
    }
    tracing::info!(
        target: "ws",
        "connect_ws called url={} aes_key_len={}",
        url,
        aes_key.len()
    );
    if url.contains("webbiz") {
        tracing::warn!(
            target: "ws",
            "connect_ws uses webbiz host (likely wrong for websocket): {}",
            url
        );
    }
    // 10001 LoginReq 的 clientInfo 必须和 HTTP 登录头保持一致，否则线上 WS 可能连上但不回消息 ACK。
    // sysModel 再按编译目标校正一次：前端若只靠 WebView UA，Mac 上可能误传 WINDOWS，导致踢不下 Mac 旧包。
    let default_client_info = WsLoginClientInfo::default();
    let mut resolved_sys_model = sys_model
        .unwrap_or(default_client_info.sys_model.clone())
        .trim()
        .to_string();
    #[cfg(target_os = "macos")]
    {
        if resolved_sys_model.is_empty()
            || resolved_sys_model.eq_ignore_ascii_case("windows")
            || resolved_sys_model.eq_ignore_ascii_case("win")
            || resolved_sys_model.eq_ignore_ascii_case("pc")
        {
            tracing::warn!(
                target: "ws",
                "connect_ws override sys_model from {:?} to MAC",
                resolved_sys_model
            );
            resolved_sys_model = "MAC".to_string();
        }
    }
    #[cfg(target_os = "windows")]
    {
        if resolved_sys_model.is_empty()
            || resolved_sys_model.eq_ignore_ascii_case("mac")
            || resolved_sys_model.eq_ignore_ascii_case("macos")
            || resolved_sys_model.eq_ignore_ascii_case("darwin")
        {
            tracing::warn!(
                target: "ws",
                "connect_ws override sys_model from {:?} to WINDOWS",
                resolved_sys_model
            );
            resolved_sys_model = "WINDOWS".to_string();
        }
    }
    let login_client_info = WsLoginClientInfo {
        app_ver: app_ver.unwrap_or(default_client_info.app_ver),
        package_code: package_code.unwrap_or(default_client_info.package_code),
        plat: plat.unwrap_or(default_client_info.plat),
        language: language.unwrap_or(default_client_info.language),
        sys_mac: sys_mac.unwrap_or_default().trim().to_string(),
        sys_model: resolved_sys_model,
    };
    ws_mgr
        .connect(
            &url,
            &aes_key,
            session_id,
            install_code,
            uid,
            login_client_info,
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn disconnect_ws(ws_mgr: State<'_, WsManager>) -> Result<(), String> {
    ws_mgr.disconnect().await;
    Ok(())
}

#[tauri::command]
pub async fn get_ws_status(ws_mgr: State<'_, WsManager>) -> Result<String, String> {
    let status = ws_mgr.get_status();
    Ok(match status {
        crate::ws::ConnectionStatus::Disconnected => "disconnected",
        crate::ws::ConnectionStatus::Connecting => "connecting",
        crate::ws::ConnectionStatus::Connected => "connected",
        crate::ws::ConnectionStatus::Reconnecting => "reconnecting",
    }
    .to_string())
}

#[tauri::command]
pub async fn get_ws_diagnostics(
    ws_mgr: State<'_, WsManager>,
) -> Result<crate::ws::WsDiagnostics, String> {
    // 对齐老 im 网络诊断：提供最近重连、Socket close/error 和连接事件摘要给诊断弹窗展示。
    Ok(ws_mgr.get_diagnostics())
}
