#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_MODE="${1:-}"
BRAND_ID="${2:-}"
RELEASE_DIST_DIR="$ROOT_DIR/release-dist/windows"

usage() {
  echo "Usage: pnpm release:dist:win:<test|uat> [45|55|97]" >&2
}

case "$BUILD_MODE" in
  test|uat) ;;
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

rm -rf "$RELEASE_DIST_DIR"
mkdir -p "$RELEASE_DIST_DIR"

if [[ -n "$BRAND_ID" ]]; then
  RELEASE_DIST_DIR="$RELEASE_DIST_DIR" \
  TAURI_BUILD_MODE="$BUILD_MODE" \
  TAURI_BUNDLES=nsis \
  COPY_WINDOWS_BINARY=0 \
  bash "$ROOT_DIR/scripts/build-release-brand.sh" "$BRAND_ID" win
else
  RELEASE_DIST_DIR="$RELEASE_DIST_DIR" \
  TAURI_BUILD_MODE="$BUILD_MODE" \
  TAURI_BUNDLES=nsis \
  COPY_WINDOWS_BINARY=0 \
  bash "$ROOT_DIR/scripts/build-release-win-installers.sh"
fi
