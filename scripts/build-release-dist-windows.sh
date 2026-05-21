#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=./lib-tauri-windows-cross.sh
source "$ROOT_DIR/scripts/lib-tauri-windows-cross.sh"

RELEASE_DIST_DIR="${RELEASE_DIST_DIR:-$ROOT_DIR/release-dist/windows}"
BUILD_TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/ocs-chat-target-windows}"
TAURI_TARGET="${TAURI_TARGET:-x86_64-pc-windows-msvc}"
TAURI_CONFIG="${TAURI_CONFIG:-}"
TAURI_BUNDLES="${TAURI_BUNDLES:-nsis}"
COPY_WINDOWS_BINARY="${COPY_WINDOWS_BINARY:-1}"
BUNDLE_WINDOWS_FFMPEG="${BUNDLE_WINDOWS_FFMPEG:-0}"
TAURI_BUILD_MODE="${TAURI_BUILD_MODE:-production}"
HOST_OS="$(uname -s 2>/dev/null || echo unknown)"

require_node() {
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if (( major < 18 )); then
    echo "Node.js >= 18.12 is required. Current: $(node -v)" >&2
    echo "Try: source ~/.nvm/nvm.sh && nvm use 20.20.1" >&2
    exit 1
  fi
}

copy_if_exists() {
  local source_path="$1"
  if [[ -f "$source_path" ]]; then
    cp -f "$source_path" "$RELEASE_DIST_DIR/"
  fi
}

latest_matching() {
  local search_dir="$1"
  local file_pattern="$2"
  local matches=()

  if [[ ! -d "$search_dir" ]]; then
    return 1
  fi

  while IFS= read -r -d '' match; do
    matches+=("$match")
  done < <(find "$search_dir" -maxdepth 1 -type f -name "$file_pattern" -print0)

  if ((${#matches[@]} == 0)); then
    return 1
  fi

  ls -t "${matches[@]}" | head -n 1
}

windows_arch_label() {
  local target="$1"
  case "$target" in
    x86_64-*) printf '%s\n' "x64" ;;
    i686-*) printf '%s\n' "x86" ;;
    aarch64-*) printf '%s\n' "arm64" ;;
    *) printf '%s\n' "$target" ;;
  esac
}

copy_windows_installer() {
  local installer_path="$1"
  local installer_name
  local version
  local env_suffix=""
  local output_name

  installer_name="$(basename "$installer_path")"
  version="$(node -p 'JSON.parse(require("fs").readFileSync("package.json","utf8")).version')"

  case "$TAURI_BUILD_MODE" in
    test|uat)
      env_suffix="_$TAURI_BUILD_MODE"
      if [[ "$installer_name" == *"_${version}_"* ]]; then
        output_name="${installer_name/_${version}_/${env_suffix}_${version}_}"
      else
        output_name="${installer_name%.exe}${env_suffix}.exe"
      fi
      ;;
    *)
      output_name="$installer_name"
      ;;
  esac

  cp -f "$installer_path" "$RELEASE_DIST_DIR/$output_name"
}

require_node

tauri_windows_prepend_homebrew_llvm_path "$HOST_OS"
RUNNER_NAME="$(tauri_windows_runner_for_host "$HOST_OS" "$TAURI_TARGET")"
if [[ "$RUNNER_NAME" == "cargo-xwin" ]]; then
  tauri_windows_require_cross_compile_deps "$TAURI_TARGET"
fi

cd "$ROOT_DIR"
mkdir -p "$RELEASE_DIST_DIR"
mkdir -p "$BUILD_TARGET_DIR"

WINDOWS_FFMPEG_EXE="$ROOT_DIR/resources/ffmpeg/windows/ffmpeg.exe"
if [[ "$BUNDLE_WINDOWS_FFMPEG" == "1" ]]; then
  if [[ ! -f "$WINDOWS_FFMPEG_EXE" ]]; then
    echo "Missing bundled ffmpeg: $WINDOWS_FFMPEG_EXE" >&2
    echo "Place the Windows ffmpeg.exe at resources/ffmpeg/windows/ffmpeg.exe before building with BUNDLE_WINDOWS_FFMPEG=1." >&2
    exit 1
  fi

  WINDOWS_FFMPEG_RESOURCE_DIR="$BUILD_TARGET_DIR/windows-ffmpeg-resource"
  mkdir -p "$WINDOWS_FFMPEG_RESOURCE_DIR"
  cp -f "$WINDOWS_FFMPEG_EXE" "$WINDOWS_FFMPEG_RESOURCE_DIR/ffmpeg.exe"

  WINDOWS_FFMPEG_TAURI_CONFIG="$BUILD_TARGET_DIR/tauri.windows-ffmpeg.conf.json"
  node "$ROOT_DIR/scripts/write-windows-ffmpeg-tauri-config.mjs" \
    "$WINDOWS_FFMPEG_TAURI_CONFIG" \
    "$TAURI_CONFIG" \
    "$WINDOWS_FFMPEG_RESOURCE_DIR/ffmpeg.exe"
  TAURI_CONFIG="$WINDOWS_FFMPEG_TAURI_CONFIG"
fi

TAURI_ARGS=(build --bundles "$TAURI_BUNDLES")
if [[ "$RUNNER_NAME" != "cargo" ]]; then
  TAURI_ARGS+=(--runner "$RUNNER_NAME")
fi
if [[ -n "$TAURI_CONFIG" ]]; then
  TAURI_ARGS+=(--config "$TAURI_CONFIG")
fi
TAURI_ARGS+=(--target "$TAURI_TARGET")

CARGO_TARGET_DIR="$BUILD_TARGET_DIR" pnpm tauri "${TAURI_ARGS[@]}"

BUILD_ROOT="$BUILD_TARGET_DIR/$TAURI_TARGET/release"

if [[ "$COPY_WINDOWS_BINARY" == "1" ]]; then
  copy_if_exists "$BUILD_ROOT/ocs-chat.exe"
  if [[ "$BUNDLE_WINDOWS_FFMPEG" == "1" ]]; then
    copy_if_exists "$BUILD_ROOT/ffmpeg.exe"
  fi
fi

if installer_path="$(latest_matching "$BUILD_ROOT/bundle/nsis" "*.exe")"; then
  copy_windows_installer "$installer_path"
fi

if [[ "$TAURI_BUILD_MODE" != "test" && "$TAURI_BUILD_MODE" != "uat" ]]; then
  if msi_path="$(latest_matching "$BUILD_ROOT/bundle/msi" "*.msi")"; then
    cp -f "$msi_path" "$RELEASE_DIST_DIR/"
  fi
  if portable_path="$(latest_matching "$BUILD_ROOT/bundle/portable" "*.zip")"; then
    cp -f "$portable_path" "$RELEASE_DIST_DIR/"
  fi
fi

echo "Windows artifacts copied to: $RELEASE_DIST_DIR"
