#!/usr/bin/env bash
# Build Windows NSIS (MSVC) from the repo root. On macOS/Linux uses cargo-xwin (see Tauri cross-platform docs).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=./lib-tauri-windows-cross.sh
source "$ROOT_DIR/scripts/lib-tauri-windows-cross.sh"

cd "$ROOT_DIR"

HOST_OS="$(uname -s 2>/dev/null || echo unknown)"
TARGET="${TAURI_TARGET:-x86_64-pc-windows-msvc}"
BUNDLES="${TAURI_BUNDLES:-nsis}"
BUNDLE_WINDOWS_FFMPEG="${BUNDLE_WINDOWS_FFMPEG:-0}"

tauri_windows_prepend_homebrew_llvm_path "$HOST_OS"

RUNNER_NAME="$(tauri_windows_runner_for_host "$HOST_OS" "$TARGET")"
if [[ "$RUNNER_NAME" == "cargo-xwin" ]]; then
  tauri_windows_require_cross_compile_deps "$TARGET"
fi

WINDOWS_FFMPEG_CONFIG_ARGS=()
if [[ "$BUNDLE_WINDOWS_FFMPEG" == "1" ]]; then
  WINDOWS_FFMPEG_EXE="$ROOT_DIR/resources/ffmpeg/windows/ffmpeg.exe"
  if [[ ! -f "$WINDOWS_FFMPEG_EXE" ]]; then
    echo "Missing bundled ffmpeg: $WINDOWS_FFMPEG_EXE" >&2
    echo "Place the Windows ffmpeg.exe at resources/ffmpeg/windows/ffmpeg.exe before building with BUNDLE_WINDOWS_FFMPEG=1." >&2
    exit 1
  fi

  WINDOWS_FFMPEG_RESOURCE_DIR="/tmp/ocs-chat-windows-ffmpeg-resource"
  mkdir -p "$WINDOWS_FFMPEG_RESOURCE_DIR"
  cp -f "$WINDOWS_FFMPEG_EXE" "$WINDOWS_FFMPEG_RESOURCE_DIR/ffmpeg.exe"

  WINDOWS_FFMPEG_TAURI_CONFIG="${CARGO_TARGET_DIR:-$ROOT_DIR/src-tauri/target}/tauri.windows-ffmpeg.conf.json"
  node "$ROOT_DIR/scripts/write-windows-ffmpeg-tauri-config.mjs" \
    "$WINDOWS_FFMPEG_TAURI_CONFIG" \
    "" \
    "$WINDOWS_FFMPEG_RESOURCE_DIR/ffmpeg.exe"
  WINDOWS_FFMPEG_CONFIG_ARGS=(--config "$WINDOWS_FFMPEG_TAURI_CONFIG")
fi

RUNNER_ARGS=()
if [[ "$RUNNER_NAME" != "cargo" ]]; then
  RUNNER_ARGS=(--runner "$RUNNER_NAME")
fi

TAURI_ARGS=(build)
if [[ "$RUNNER_NAME" != "cargo" ]]; then
  TAURI_ARGS+=("${RUNNER_ARGS[@]}")
fi
if [[ "$BUNDLE_WINDOWS_FFMPEG" == "1" ]]; then
  TAURI_ARGS+=("${WINDOWS_FFMPEG_CONFIG_ARGS[@]}")
fi
TAURI_ARGS+=(--target "$TARGET" --bundles "$BUNDLES")

exec pnpm exec tauri "${TAURI_ARGS[@]}" "$@"
