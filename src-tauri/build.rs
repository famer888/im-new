fn main() {
    let proto_dir = "../proto";
    let out_dir = "src/proto/generated";

    std::fs::create_dir_all(out_dir).expect("Failed to create proto output directory");

    // Primary: imweb-web.proto is the main WebSocket protocol definition.
    // It imports common.proto, group_message.proto, and channel_event.proto,
    // so prost will pull those in transitively. All types land in generated/_.rs
    // since these protos use the default (empty) package.
    prost_build::Config::new()
        .out_dir(out_dir)
        .compile_protos(&[format!("{}/imweb-web.proto", proto_dir)], &[proto_dir])
        .expect("Failed to compile imweb-web.proto");

    // Secondary proto files each get their own subdirectory to avoid symbol
    // collisions — many redefine shared enums/messages (MessageType,
    // GroupOperator, UserParam, etc.) in the default package.
    let secondary: &[(&str, &str)] = &[
        ("im.proto", "im"),
        ("web.proto", "web"),
        ("user.proto", "user"),
        ("group.proto", "group"),
        ("sys.proto", "sys"),
        ("domain_url.proto", "domain_url"),
        ("channel_api.proto", "channel_api"),
        ("friend_message.proto", "friend_message"),
    ];

    for (file, subdir) in secondary {
        let sub_out = format!("{}/{}", out_dir, subdir);
        std::fs::create_dir_all(&sub_out).expect("Failed to create proto subdirectory");
        prost_build::Config::new()
            .out_dir(&sub_out)
            .compile_protos(&[format!("{}/{}", proto_dir, file)], &[proto_dir])
            .unwrap_or_else(|e| {
                println!("cargo:warning=Failed to compile {}: {}", file, e);
            });
    }

    // Re-run build if any proto file changes.
    println!("cargo:rerun-if-changed={}", proto_dir);
    // Tauri app icons are embedded into macOS app metadata during build.
    // Without watching these paths, Cargo may reuse stale build artifacts
    // after only icon assets changed, leaving Dock/Finder icons outdated.
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=tauri.conf.json");

    tauri_build::build();
}
