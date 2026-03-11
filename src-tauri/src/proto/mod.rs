/// Primary WebSocket protocol types from imweb-web.proto.
/// Includes all types transitively imported from: common.proto,
/// group_message.proto, and channel_event.proto.
#[allow(clippy::all, warnings)]
pub mod imweb {
    include!("generated/_.rs");
}

/// Native IM protocol types from im.proto.
#[allow(clippy::all, warnings)]
pub mod im {
    include!("generated/im/_.rs");
}

/// Web HTTP API types from web.proto.
#[allow(clippy::all, warnings)]
pub mod web {
    include!("generated/web/_.rs");
}

/// User module types from user.proto.
#[allow(clippy::all, warnings)]
pub mod user {
    include!("generated/user/_.rs");
}

/// Group module types from group.proto.
#[allow(clippy::all, warnings)]
pub mod group {
    include!("generated/group/_.rs");
}

/// System module types from sys.proto.
#[allow(clippy::all, warnings)]
pub mod sys {
    include!("generated/sys/_.rs");
}

/// Domain URL types from domain_url.proto.
#[allow(clippy::all, warnings)]
pub mod domain_url {
    include!("generated/domain_url/_.rs");
}

/// Channel API types from channel_api.proto.
#[allow(clippy::all, warnings)]
pub mod channel_api {
    include!("generated/channel_api/_.rs");
}

/// Friend message types from friend_message.proto.
#[allow(clippy::all, warnings)]
pub mod friend_message {
    include!("generated/friend_message/_.rs");
}
