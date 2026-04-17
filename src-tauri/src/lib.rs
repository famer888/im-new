mod commands;
mod config;
mod crypto;
mod db;
mod logger;
mod messaging;
mod platform;
mod proto;
mod updater;
mod window;
mod ws;

use tauri::{Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder};
use tracing::info;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            logger::init(&app_data_dir)?;
            info!("OCS Chat starting...");

            let app_handle = app.handle().clone();

            // Init database
            let db_manager = db::DbManager::new(&app_data_dir)?;
            app.manage(db_manager);

            // Init config
            let config_manager = config::ConfigManager::new(&app_data_dir)?;
            app.manage(config_manager);

            // Init window manager
            let win_manager = window::WindowManager::new();
            app.manage(win_manager);

            // Init websocket manager
            let ws_manager = ws::WsManager::new(app_handle.clone());
            app.manage(ws_manager);

            // Init crypto engine
            let crypto_engine = crypto::CryptoEngine::new();
            app.manage(crypto_engine);

            // Init domain pool
            let domain_pool = commands::domain::DomainPoolState::new();
            app.manage(domain_pool);

            // Prevent system sleep
            let _ = commands::platform::prevent_sleep();

            // Setup tray
            window::tray::setup_tray(app)?;

            // Create login window with platform-specific settings
            {
                let mut builder = WebviewWindowBuilder::new(
                    app,
                    "login",
                    WebviewUrl::App("/#/login".into()),
                )
                .title("OCS Chat")
                .inner_size(300.0, 420.0)
                .resizable(false)
                .center()
                .visible(true);

                #[cfg(target_os = "macos")]
                {
                    builder = builder
                        .decorations(true)
                        .title_bar_style(tauri::TitleBarStyle::Overlay)
                        .hidden_title(true);
                }

                #[cfg(not(target_os = "macos"))]
                {
                    builder = builder.decorations(false).transparent(true);
                }

                builder.build()?;
                info!("Login window created");
            }

            // Listen for deep links
            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                app.listen("deep-link://new-url", move |event| {
                    info!("Deep link received: {:?}", event.payload());
                    let _ = handle.emit("deep-link", event.payload());
                });
            }

            info!("OCS Chat initialized successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::login,
            commands::auth::logout,
            commands::auth::get_session,
            commands::chat::get_conversations,
            commands::chat::get_messages,
            commands::chat::send_message,
            commands::chat::mark_as_read,
            commands::chat::delete_message,
            commands::chat::pin_conversation,
            commands::chat::mute_conversation,
            commands::chat::archive_conversation,
            commands::chat::recall_message,
            commands::chat::delete_conversation,
            commands::chat::search_messages,
            commands::chat::clear_all_local_chat_history,
            commands::chat::cache_group_rel_key,
            commands::chat::has_group_rel_key,
            commands::chat::has_friend_rel_key,
            commands::chat::derive_group_rel_key,
            commands::chat::derive_friend_rel_key,
            commands::chat::decrypt_private_incoming,
            commands::chat::decrypt_group_incoming,
            commands::chat::set_curve_private_key_hex,
            commands::chat::generate_curve25519_keypair,
            commands::chat::mark_message_sent,
            commands::chat::upsert_incoming_messages,
            commands::contacts::get_contacts,
            commands::contacts::search_contacts,
            commands::contacts::add_contact,
            commands::contacts::delete_contact,
            commands::groups::get_groups,
            commands::groups::get_group_members,
            commands::groups::create_group,
            commands::groups::invite_members,
            commands::channels::get_channels,
            commands::channels::get_channel_info,
            commands::file::upload_file,
            commands::file::download_file,
            commands::file::get_download_progress,
            commands::file::save_base64_image,
            commands::window::open_chat_window,
            commands::window::close_chat_window,
            commands::window::toggle_side_bar,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::repair::repair_clear_crypto_keys,
            commands::repair::repair_reset_user_local_data,
            commands::ws::connect_ws,
            commands::ws::disconnect_ws,
            commands::ws::get_ws_status,
            commands::ntp::get_ntp_time,
            commands::domain::get_domain_pool,
            commands::domain::update_domain_pool,
            commands::domain::mark_domain_error,
            commands::domain::get_first_normal_domain,
            commands::platform::get_platform_info,
            commands::platform::prevent_sleep,
            commands::platform::allow_sleep,
            commands::sentry::report_error,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
