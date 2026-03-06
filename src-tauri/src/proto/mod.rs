// Generated protobuf modules will be included here after prost-build runs.
// For now, define placeholder types matching the OCS protocol.

pub mod common {
    #[derive(Clone, Debug)]
    pub struct ClientInfo {
        pub session_id: String,
        pub app_ver: i32,
        pub package_code: i32,
        pub plat: i32,
        pub language: i32,
        pub sys_mac: String,
        pub sys_model: String,
    }
}

pub mod messages {
    #[derive(Clone, Debug)]
    pub struct LoginReq {
        pub client_info: Option<super::common::ClientInfo>,
        pub install_code: String,
    }

    #[derive(Clone, Debug)]
    pub struct OneToOneMessage {
        pub msg_id: String,
        pub send_uid: String,
        pub receive_uid: String,
        pub msg_type: i32,
        pub content: Vec<u8>,
        pub send_time: i64,
        pub version: i64,
        pub content_md5: String,
        pub attachment_key: String,
    }

    #[derive(Clone, Debug)]
    pub struct GroupMessage {
        pub send_uid: String,
        pub group_id: String,
        pub msg_type: i32,
        pub content: Vec<u8>,
        pub at_uids: Vec<String>,
        pub send_time: i64,
        pub msg_id: String,
        pub version: i64,
    }

    #[derive(Clone, Debug)]
    pub struct ChannelMessage {
        pub send_uid: String,
        pub channel_id: String,
        pub msg_type: i32,
        pub content: Vec<u8>,
        pub msg_id: String,
        pub read_total: i32,
        pub msg_time: i64,
        pub version: i64,
    }

    #[derive(Clone, Debug, Copy)]
    #[repr(i32)]
    pub enum MessageType {
        Text = 0,
        Image = 1,
        Audio = 2,
        Video = 3,
        Location = 4,
        NameCard = 5,
        System = 6,
        File = 7,
        Notice = 8,
        DynamicImage = 9,
        RedPacket = 10,
        Html = 11,
        SetImage = 12,
        ChatTransfer = 13,
        ChatTransferResult = 14,
        RedPacketResult = 15,
        Html2 = 16,
        MediasCaption = 17,
        AnimatedGame = 18,
    }
}
