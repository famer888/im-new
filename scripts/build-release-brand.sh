#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRAND_ID="${1:-}"
PLATFORM="${2:-mac}"
USE_SOURCE_ICNS="${USE_SOURCE_ICNS:-0}"

usage() {
  echo "Usage: bash ./scripts/build-release-brand.sh <45|55|97|all> [mac|win]" >&2
}

if [[ -z "$BRAND_ID" ]]; then
  usage
  exit 1
fi

case "$PLATFORM" in
  mac|win) ;;
  *)
    echo "Unknown platform: $PLATFORM" >&2
    usage
    exit 1
    ;;
esac

if [[ "$BRAND_ID" == "all" ]]; then
  for brand in 97 45 55; do
    bash "$ROOT_DIR/scripts/build-release-brand.sh" "$brand" "$PLATFORM"
  done
  exit 0
fi

case "$BRAND_ID" in
  45|55|97) ;;
  *)
    echo "Unknown brand id: $BRAND_ID" >&2
    usage
    exit 1
    ;;
esac

ICON_SOURCE_DIR="$ROOT_DIR/resources/icons_$BRAND_ID"
ICON_TARGET_DIR="$ROOT_DIR/src-tauri/icons"

find_png_size() {
  local path="$1"
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const png = fs.readFileSync(file);
    if (
      png.length >= 24 &&
      png[0] === 0x89 &&
      png.toString("ascii", 1, 4) === "PNG" &&
      png.toString("ascii", 12, 16) === "IHDR"
    ) {
      console.log(`${png.readUInt32BE(16)} ${png.readUInt32BE(20)}`);
    }
  ' "$path"
}

choose_icon_png() {
  local candidates=(
    "$ICON_SOURCE_DIR/1024x1024.png"
    "$ICON_SOURCE_DIR/512x512.png"
    "$ICON_SOURCE_DIR/256x256.png"
    "$ICON_SOURCE_DIR/icon.png"
  )
  local best_path=""
  local best_size=0

  for candidate in "${candidates[@]}"; do
    if [[ ! -f "$candidate" ]]; then
      continue
    fi

    read -r width height < <(find_png_size "$candidate")
    if [[ -z "${width:-}" || "$width" != "$height" ]]; then
      continue
    fi

    if (( width > best_size )); then
      best_size="$width"
      best_path="$candidate"
    fi
  done

  if [[ -n "$best_path" ]]; then
    printf '%s\n' "$best_path"
  fi
}

ICON_PNG="$(choose_icon_png)"

if [[ -z "$ICON_PNG" ]]; then
  echo "Missing square PNG source icon in: $ICON_SOURCE_DIR" >&2
  exit 1
fi

APP_NAME="${APP_NAME:-OCS Chat $BRAND_ID}"
PKG_IDENTIFIER="${PKG_IDENTIFIER:-cn.$BRAND_ID.chat}"
RELEASE_DIST_DIR="${RELEASE_DIST_DIR:-$ROOT_DIR/release-dist/$PLATFORM/icons_$BRAND_ID}"
BACKUP_DIR="$(mktemp -d)"
TAURI_CONFIG_FILE="$(mktemp "$ROOT_DIR/.tauri-brand-$BRAND_ID.XXXXXX.json")"

restore_icons() {
  if [[ -d "$BACKUP_DIR/icons" ]]; then
    rm -rf "$ICON_TARGET_DIR"
    mkdir -p "$ICON_TARGET_DIR"
    cp -R "$BACKUP_DIR/icons/." "$ICON_TARGET_DIR/"
  fi
  rm -rf "$BACKUP_DIR"
  rm -f "$TAURI_CONFIG_FILE"
}

trap restore_icons EXIT

mkdir -p "$BACKUP_DIR/icons"
cp -R "$ICON_TARGET_DIR/." "$BACKUP_DIR/icons/"

cd "$ROOT_DIR"

read -r ICON_WIDTH ICON_HEIGHT < <(find_png_size "$ICON_PNG")
if (( ICON_WIDTH < 512 )); then
  echo "Warning: $ICON_PNG is ${ICON_WIDTH}x${ICON_HEIGHT}; macOS app icons are best from 1024x1024 or 512x512." >&2
fi

pnpm tauri icon "$ICON_PNG" --output "$ICON_TARGET_DIR"

if [[ "$USE_SOURCE_ICNS" == "1" && -f "$ICON_SOURCE_DIR/icon.icns" ]] && file "$ICON_SOURCE_DIR/icon.icns" | grep -q "Mac OS X icon"; then
  cp -f "$ICON_SOURCE_DIR/icon.icns" "$ICON_TARGET_DIR/icon.icns"
fi

node -e 'const fs = require("fs"); const [out, productName, identifier] = process.argv.slice(1); fs.writeFileSync(out, JSON.stringify({ productName, identifier }, null, 2));' "$TAURI_CONFIG_FILE" "$APP_NAME" "$PKG_IDENTIFIER"

echo "Building $APP_NAME ($PKG_IDENTIFIER) with icons_$BRAND_ID for $PLATFORM"

if [[ "$PLATFORM" == "mac" ]]; then
  APP_NAME="$APP_NAME" \
  PKG_IDENTIFIER="$PKG_IDENTIFIER" \
  RELEASE_DIST_DIR="$RELEASE_DIST_DIR" \
  TAURI_CONFIG="$TAURI_CONFIG_FILE" \
  TAURI_BUNDLES="${TAURI_BUNDLES:-app,dmg}" \
  COPY_APP_BUNDLE="${COPY_APP_BUNDLE:-1}" \
  COPY_DMG="${COPY_DMG:-1}" \
  bash "$ROOT_DIR/scripts/build-release-dist-macos.sh"
else
  RELEASE_DIST_DIR="$RELEASE_DIST_DIR" \
  TAURI_CONFIG="$TAURI_CONFIG_FILE" \
  TAURI_BUNDLES="${TAURI_BUNDLES:-nsis}" \
  COPY_WINDOWS_BINARY="${COPY_WINDOWS_BINARY:-1}" \
  bash "$ROOT_DIR/scripts/build-release-dist-windows.sh"
fi

echo "Brand artifacts copied to: $RELEASE_DIST_DIR"
