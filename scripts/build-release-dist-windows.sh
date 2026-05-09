#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIST_DIR="${RELEASE_DIST_DIR:-$ROOT_DIR/release-dist/windows}"
BUILD_TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/ocs-chat-target-windows}"
TAURI_TARGET="${TAURI_TARGET:-x86_64-pc-windows-msvc}"
TAURI_CONFIG="${TAURI_CONFIG:-}"
TAURI_BUNDLES="${TAURI_BUNDLES:-nsis}"
COPY_WINDOWS_BINARY="${COPY_WINDOWS_BINARY:-1}"

require_node() {
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if (( major < 18 )); then
    echo "Node.js >= 18.12 is required. Current: $(node -v)" >&2
    echo "Try: source ~/.nvm/nvm.sh && nvm use 20.20.1" >&2
    exit 1
  fi
}

require_windows_host() {
  local host_os
  host_os="$(uname -s 2>/dev/null || echo unknown)"

  case "$host_os" in
    MINGW*|MSYS*|CYGWIN*) ;;
    *)
      echo "Windows NSIS installers must be built on Windows." >&2
      echo "Current host: $host_os" >&2
      echo "Run this on a Windows machine or Windows CI:" >&2
      echo "  pnpm release:dist:win:installers" >&2
      exit 1
      ;;
  esac
}

copy_if_exists() {
  local source_path="$1"
  if [[ -f "$source_path" ]]; then
    cp -f "$source_path" "$RELEASE_DIST_DIR/"
  fi
}

copy_latest_matching() {
  local search_dir="$1"
  local file_pattern="$2"
  local matches=()

  if [[ ! -d "$search_dir" ]]; then
    return 0
  fi

  while IFS= read -r -d '' match; do
    matches+=("$match")
  done < <(find "$search_dir" -maxdepth 1 -type f -name "$file_pattern" -print0)

  if ((${#matches[@]} == 0)); then
    return 0
  fi

  cp -f "$(ls -t "${matches[@]}" | head -n 1)" "$RELEASE_DIST_DIR/"
}

require_node
require_windows_host

cd "$ROOT_DIR"
mkdir -p "$RELEASE_DIST_DIR"
mkdir -p "$BUILD_TARGET_DIR"

TAURI_ARGS=(build --bundles "$TAURI_BUNDLES")
if [[ -n "$TAURI_CONFIG" ]]; then
  TAURI_ARGS+=(--config "$TAURI_CONFIG")
fi
TAURI_ARGS+=(--target "$TAURI_TARGET")

CARGO_TARGET_DIR="$BUILD_TARGET_DIR" pnpm tauri "${TAURI_ARGS[@]}"

BUILD_ROOT="$BUILD_TARGET_DIR/$TAURI_TARGET/release"

if [[ "$COPY_WINDOWS_BINARY" == "1" ]]; then
  copy_if_exists "$BUILD_ROOT/ocs-chat.exe"
fi
copy_latest_matching "$BUILD_ROOT/bundle/nsis" "*.exe"
copy_latest_matching "$BUILD_ROOT/bundle/msi" "*.msi"
copy_latest_matching "$BUILD_ROOT/bundle/portable" "*.zip"

echo "Windows artifacts copied to: $RELEASE_DIST_DIR"
