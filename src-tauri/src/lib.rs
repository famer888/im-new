mod branding;
mod commands;
mod config;
mod crypto;
mod db;
mod logger;
mod messaging;
mod platform;
mod proto;
mod window;
mod ws;

use tauri::{Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder};
use tracing::info;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_display_name = branding::app_display_name(app);
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            logger::init(&app_data_dir)?;
            info!("{} starting...", app_display_name);

            let app_handle = app.handle().clone();
            commands::auth::start_active_login_monitor(app_handle.clone());
            commands::file::start_windows_ffmpeg_bootstrap(app_handle.clone());

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

            // Create the login window eagerly so packaged builds land on a stable first screen.
            {
                let disable_auto_login = std::env::args().any(|arg| arg == "--disable-auto-login");
                let login_url = if disable_auto_login {
                    "/#/login?autoLogin=0"
                } else {
                    "/#/login"
                };
                let mut builder =
                    WebviewWindowBuilder::new(app, "login", WebviewUrl::App(login_url.into()))
                        .title(&app_display_name)
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
                    builder = builder.decorations(false);
                }

                let window = builder.build()?;
                window::hide_to_tray_on_close(&window);
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

            info!("{} initialized successfully", app_display_name);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::account_transfer::export_account_history_data,
            commands::account_transfer::import_account_history_data,
            commands::auth::login,
            commands::auth::logout,
            commands::auth::get_session,
            commands::auth::ensure_can_login_on_this_machine,
            commands::chat::get_conversations,
            commands::chat::get_messages,
            commands::chat::send_message,
            commands::chat::mark_as_read,
            commands::chat::apply_friend_read_receipts,
            commands::chat::apply_group_read_receipts,
            commands::chat::apply_channel_read_receipts,
            commands::chat::delete_message,
            commands::chat::pin_conversation,
            commands::chat::mute_conversation,
            commands::chat::archive_conversation,
            commands::chat::set_conversation_draft,
            commands::chat::recall_message,
            commands::chat::clear_conversation_history,
            commands::chat::delete_conversation,
            commands::chat::search_messages,
            commands::chat::clear_all_local_chat_history,
            commands::chat::cache_group_rel_key,
            commands::chat::has_group_rel_key,
            commands::chat::has_channel_rel_key,
            commands::chat::clear_group_rel_key,
            commands::chat::clear_channel_rel_key,
            commands::chat::has_friend_rel_key,
            commands::chat::clear_friend_rel_key,
            commands::chat::derive_group_rel_key,
            commands::chat::derive_channel_rel_key,
            commands::chat::derive_friend_rel_key,
            commands::chat::save_own_curve_key,
            commands::chat::load_own_curve_key,
            commands::chat::decrypt_private_incoming,
            commands::chat::decrypt_private_attachment_key,
            commands::chat::decrypt_group_incoming,
            commands::chat::decrypt_channel_incoming,
            commands::chat::set_curve_private_key_hex,
            commands::chat::generate_curve25519_keypair,
            commands::chat::mark_message_sent,
            commands::chat::mark_private_message_decrypted,
            commands::chat::upsert_incoming_messages,
            commands::chat::send_group_event_receipt,
            commands::contacts::get_contacts,
            commands::contacts::search_contacts,
            commands::contacts::add_contact,
            commands::contacts::upsert_contact,
            commands::contacts::delete_contact,
            commands::groups::get_groups,
            commands::groups::get_group_members,
            commands::groups::create_group,
            commands::groups::invite_members,
            commands::log_upload::prepare_log_upload_package,
            commands::channels::get_channels,
            commands::channels::get_channel_info,
            commands::channels::save_channels,
            commands::channels::delete_channel,
            commands::file::upload_file,
            commands::file::upload_oss_object,
            commands::file::image_send_log,
            commands::file::download_file,
            commands::file::create_video_stream_url,
            commands::file::create_local_video_stream_url,
            commands::file::probe_video_format,
            commands::file::convert_video_to_compatible_mp4,
            commands::file::play_audio_file,
            commands::file::stop_audio_file,
            commands::file::get_download_progress,
            commands::file::save_base64_image,
            commands::file::copy_file_overwrite,
            commands::file::file_exists,
            commands::file::reveal_file_in_directory,
            commands::file::open_file,
            commands::file::open_in_browser,
            commands::media::open_media_window,
            commands::media::media_window_minimize,
            commands::media::media_window_toggle_maximize,
            commands::media::media_window_toggle_fullscreen,
            commands::media::media_window_close,
            commands::media::media_window_is_maximized,
            commands::media::media_window_is_fullscreen,
            commands::window::open_chat_window,
            commands::window::close_chat_window,
            commands::window::show_notification_window,
            commands::window::resize_notification_window,
            commands::window::toggle_side_bar,
            commands::window::show_login_window,
            commands::window::update_tray_unread_count,
            commands::window::toggle_devtools,
            commands::window::open_devtools,
            commands::window::exit_app,
            commands::window::restart_app_for_network,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::repair::repair_clear_crypto_keys,
            commands::repair::repair_reset_user_local_data,
            commands::ws::connect_ws,
            commands::ws::disconnect_ws,
            commands::ws::get_ws_status,
            commands::ws::get_ws_diagnostics,
            commands::ntp::get_ntp_time,
            commands::domain::get_domain_pool,
            commands::domain::update_domain_pool,
            commands::domain::mark_domain_error,
            commands::domain::get_first_normal_domain,
            commands::domain::save_list_domain_snapshot,
            commands::domain::fetch_url_text,
            commands::domain::probe_url,
            commands::domain::proxy_http_text,
            commands::domain::proxy_http_binary,
            commands::platform::get_platform_info,
            commands::platform::get_network_snapshot,
            commands::platform::system_beep,
            commands::platform::read_clipboard_files,
            commands::platform::read_local_files,
            commands::platform::stat_local_files,
            commands::platform::read_clipboard_text,
            commands::platform::write_clipboard_text,
            commands::platform::write_clipboard_image,
            commands::platform::write_clipboard_file,
            commands::platform::start_native_file_drag,
            commands::platform::start_screenshot,
            commands::platform::prevent_sleep,
            commands::platform::allow_sleep,
            commands::sentry::report_error,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
