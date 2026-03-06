fn main() {
    // Protobuf code generation
    prost_build::Config::new()
        .out_dir("src/proto")
        .compile_protos(
            &[
                "../proto/common.proto",
                "../proto/imweb.proto",
                "../proto/web.proto",
                "../proto/user.proto",
                "../proto/group.proto",
                "../proto/channel.proto",
                "../proto/sys.proto",
            ],
            &["../proto/"],
        )
        .expect("Failed to compile protobuf files");

    tauri_build::build();
}
