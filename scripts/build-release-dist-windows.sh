#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIST_DIR="${RELEASE_DIST_DIR:-$ROOT_DIR/release-dist/windows}"
BUILD_TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/ocs-chat-target-windows}"
TAURI_TARGET="${TAURI_TARGET:-x86_64-pc-windows-msvc}"

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

cd "$ROOT_DIR"
mkdir -p "$RELEASE_DIST_DIR"
mkdir -p "$BUILD_TARGET_DIR"

CARGO_TARGET_DIR="$BUILD_TARGET_DIR" pnpm tauri build --target "$TAURI_TARGET"

BUILD_ROOT="$BUILD_TARGET_DIR/$TAURI_TARGET/release"

copy_if_exists "$BUILD_ROOT/ocs-chat.exe"
copy_latest_matching "$BUILD_ROOT/bundle/nsis" "*.exe"
copy_latest_matching "$BUILD_ROOT/bundle/msi" "*.msi"
copy_latest_matching "$BUILD_ROOT/bundle/portable" "*.zip"

echo "Windows artifacts copied to: $RELEASE_DIST_DIR"
