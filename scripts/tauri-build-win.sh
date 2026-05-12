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

tauri_windows_prepend_homebrew_llvm_path "$HOST_OS"

RUNNER_NAME="$(tauri_windows_runner_for_host "$HOST_OS" "$TARGET")"
if [[ "$RUNNER_NAME" == "cargo-xwin" ]]; then
  tauri_windows_require_cross_compile_deps "$TARGET"
fi

RUNNER_ARGS=()
if [[ "$RUNNER_NAME" != "cargo" ]]; then
  RUNNER_ARGS=(--runner "$RUNNER_NAME")
fi

exec pnpm exec tauri build "${RUNNER_ARGS[@]}" --target "$TARGET" --bundles "$BUNDLES" "$@"
