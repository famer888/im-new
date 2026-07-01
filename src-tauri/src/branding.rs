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
    use super::{brand_display_name, brand_id_from_identifier, normalize_brand_id};

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
}
