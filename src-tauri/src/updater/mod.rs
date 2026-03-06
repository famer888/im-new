use serde::{Deserialize, Serialize};
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionInfo {
    pub flag: bool,
    pub title: String,
    pub content: String,
    pub url: String,
    pub version: String,
}

pub async fn check_version(api_url: &str, current_version: &str) -> Result<VersionInfo, String> {
    info!("Checking for updates, current version: {}", current_version);
    // TODO: Implement via protobuf CheckVersionReq/Resp
    Ok(VersionInfo {
        flag: false,
        title: String::new(),
        content: String::new(),
        url: String::new(),
        version: current_version.to_string(),
    })
}
