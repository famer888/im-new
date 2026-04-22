#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="OCS Chat"
PKG_IDENTIFIER="cn.55.chat"
RELEASE_DIST_DIR="${RELEASE_DIST_DIR:-$ROOT_DIR/release-dist/macos}"
BUILD_TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/ocs-chat-target-macos}"
TAURI_TARGET="${TAURI_TARGET:-}"

require_node() {
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if (( major < 18 )); then
    echo "Node.js >= 18.12 is required. Current: $(node -v)" >&2
    echo "Try: source ~/.nvm/nvm.sh && nvm use 20.20.1" >&2
    exit 1
  fi
}

json_get() {
  local key="$1"
  node -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); console.log(pkg['$key']);"
}

latest_file() {
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

require_node

cd "$ROOT_DIR"

VERSION="$(json_get version)"

mkdir -p "$RELEASE_DIST_DIR"
mkdir -p "$BUILD_TARGET_DIR"

TAURI_ARGS=(build --bundles app,dmg)
if [[ -n "$TAURI_TARGET" ]]; then
  TAURI_ARGS+=(--target "$TAURI_TARGET")
fi

CARGO_TARGET_DIR="$BUILD_TARGET_DIR" pnpm tauri "${TAURI_ARGS[@]}"

if [[ -n "$TAURI_TARGET" ]]; then
  BUILD_ROOT="$BUILD_TARGET_DIR/$TAURI_TARGET/release"
else
  BUILD_ROOT="$BUILD_TARGET_DIR/release"
fi

APP_PATH="$BUILD_ROOT/bundle/macos/$APP_NAME.app"
DMG_PATH="$(latest_file "$BUILD_ROOT/bundle/dmg" "*.dmg" || true)"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Expected app bundle not found: $APP_PATH" >&2
  exit 1
fi

ARCH_LABEL="${TAURI_TARGET:-$(uname -m)}"
PKG_STAGE_ROOT="/tmp/ocs-chat-pkg-root"
PKG_COMPONENT_PLIST="/tmp/ocs-chat-component.plist"
PKG_OUTPUT_PATH="$RELEASE_DIST_DIR/${APP_NAME}_${VERSION}_${ARCH_LABEL}.pkg"

rm -rf "$PKG_STAGE_ROOT" "$PKG_COMPONENT_PLIST"
mkdir -p "$PKG_STAGE_ROOT/Applications"
cp -R "$APP_PATH" "$PKG_STAGE_ROOT/Applications/"

pkgbuild --analyze --root "$PKG_STAGE_ROOT" "$PKG_COMPONENT_PLIST" >/dev/null
/usr/libexec/PlistBuddy -c "Set :0:BundleIsRelocatable false" "$PKG_COMPONENT_PLIST" >/dev/null

pkgbuild \
  --root "$PKG_STAGE_ROOT" \
  --identifier "$PKG_IDENTIFIER" \
  --version "$VERSION" \
  --install-location / \
  --component-plist "$PKG_COMPONENT_PLIST" \
  "$PKG_OUTPUT_PATH" >/dev/null

ditto "$APP_PATH" "$RELEASE_DIST_DIR/$APP_NAME.app"

if [[ -n "$DMG_PATH" && -f "$DMG_PATH" ]]; then
  cp -f "$DMG_PATH" "$RELEASE_DIST_DIR/"
fi

echo "macOS artifacts copied to: $RELEASE_DIST_DIR"
