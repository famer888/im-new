#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_MODE="${1:-}"
BRAND_ID="${2:-}"
RELEASE_DIST_DIR="$ROOT_DIR/release-dist"

usage() {
  echo "Usage: pnpm release:dist:mac:<test|uat|prod> [45|55|97]" >&2
}

case "$BUILD_MODE" in
  # 允许 prod 走统一入口，内部映射为 tauri production mode。
  test|uat|prod) ;;
  *)
    echo "Unknown build mode: $BUILD_MODE" >&2
    usage
    exit 1
    ;;
esac

if [[ -n "$BRAND_ID" ]]; then
  case "$BRAND_ID" in
    45|55|97) ;;
    *)
      echo "Unknown brand id: $BRAND_ID" >&2
      usage
      exit 1
      ;;
  esac
fi

cd "$ROOT_DIR"

# 对齐 tauri build 参数：release-dist 的 prod 别名对应 production。
TAURI_MODE="$BUILD_MODE"
if [[ "$TAURI_MODE" == "prod" ]]; then
  TAURI_MODE="production"
fi

rm -rf "$RELEASE_DIST_DIR"
mkdir -p "$RELEASE_DIST_DIR"

if [[ -n "$BRAND_ID" ]]; then
  RELEASE_DIST_DIR="$RELEASE_DIST_DIR" \
  TAURI_BUILD_MODE="$TAURI_MODE" \
  TAURI_BUNDLES=app \
  COPY_APP_BUNDLE=0 \
  COPY_DMG=0 \
  bash "$ROOT_DIR/scripts/build-release-brand.sh" "$BRAND_ID" mac
else
  RELEASE_DIST_DIR="$RELEASE_DIST_DIR" \
  TAURI_BUILD_MODE="$TAURI_MODE" \
  bash "$ROOT_DIR/scripts/build-release-mac-pkgs.sh"
fi
