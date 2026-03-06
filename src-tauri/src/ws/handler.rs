use tracing::info;

pub fn handle_login_response(payload: &[u8]) {
    info!("Login response received");
}

pub fn handle_friend_event(payload: &[u8]) {
    info!("Friend event received");
}

pub fn handle_group_event(payload: &[u8]) {
    info!("Group event received");
}

pub fn handle_channel_event(payload: &[u8]) {
    info!("Channel event received");
}

pub fn handle_system_event(payload: &[u8]) {
    info!("System event received");
}
