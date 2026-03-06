use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainItem {
    pub domain: String,
    pub status: String,
    pub module_code: String,
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
pub fn mark_domain_error(
    state: State<'_, DomainPoolState>,
    module_code: String,
    domain: String,
) {
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
