use tauri::{Manager, Runtime};

pub const DEFAULT_BRAND_ID: &str = "97";
pub const BRAND_NAME_PREFIX: &str = "OCS Chat";

pub fn normalize_brand_id(input: &str) -> &'static str {
    match input.trim() {
        "45" => "45",
        "55" => "55",
        "97" => "97",
        _ => DEFAULT_BRAND_ID,
    }
}

pub fn brand_id_from_identifier(identifier: &str) -> &'static str {
    if let Some(raw_brand_id) = identifier
        .trim()
        .strip_prefix("cn.")
        .and_then(|value| value.strip_suffix(".chat"))
    {
        return normalize_brand_id(raw_brand_id);
    }

    normalize_brand_id(identifier)
}

pub fn brand_display_name(brand_id: &str) -> String {
    format!("{}-im", normalize_brand_id(brand_id))
}

/// 旧 Electron 安装包 userData 目录名，如 `97-im`。
pub fn legacy_electron_user_data_name(brand_id: &str) -> String {
    brand_display_name(brand_id)
}

/// 旧项目 Temp 缓存目录前缀，如 `97LocalStorage`。
pub fn legacy_temp_storage_dir_name(brand_id: &str) -> String {
    format!("{}LocalStorage", normalize_brand_id(brand_id))
}

/// 旧项目自动导出/导入历史记录 AES 密钥（与 cacheDB.js 一致）。
pub fn legacy_history_cache_key(brand_id: &str) -> &'static str {
    match normalize_brand_id(brand_id) {
        "45" => "4554",
        "55" => "5554",
        _ => "9754",
    }
}

pub fn app_brand_id<R: Runtime, M: Manager<R>>(manager: &M) -> &'static str {
    brand_id_from_identifier(&manager.config().identifier)
}

pub fn app_display_name<R: Runtime, M: Manager<R>>(manager: &M) -> String {
    brand_display_name(app_brand_id(manager))
}

pub fn chat_window_title<R: Runtime, M: Manager<R>>(manager: &M, title: &str) -> String {
    let conversation_title = title.trim();
    let app_name = app_display_name(manager);
    if conversation_title.is_empty() {
        app_name
    } else {
        format!("{} - {}", conversation_title, app_name)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        brand_display_name, brand_id_from_identifier, legacy_electron_user_data_name,
        legacy_history_cache_key, legacy_temp_storage_dir_name, normalize_brand_id,
    };

    #[test]
    fn normalize_brand_id_defaults_to_97() {
        assert_eq!(normalize_brand_id(""), "97");
        assert_eq!(normalize_brand_id("68"), "97");
    }

    #[test]
    fn parse_brand_id_from_identifier() {
        assert_eq!(brand_id_from_identifier("cn.45.chat"), "45");
        assert_eq!(brand_id_from_identifier("cn.55.chat"), "55");
        assert_eq!(brand_id_from_identifier("cn.97.chat"), "97");
    }

    #[test]
    fn build_display_name() {
        assert_eq!(brand_display_name("55"), "55-im");
    }

    #[test]
    fn legacy_brand_helpers_are_scoped() {
        assert_eq!(legacy_temp_storage_dir_name("45"), "45LocalStorage");
        assert_eq!(legacy_temp_storage_dir_name("97"), "97LocalStorage");
        assert_eq!(legacy_history_cache_key("45"), "4554");
        assert_eq!(legacy_history_cache_key("55"), "5554");
        assert_eq!(legacy_history_cache_key("97"), "9754");
        assert_eq!(legacy_electron_user_data_name("55"), "55-im");
    }
}
