#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIST_DIR="${RELEASE_DIST_DIR:-$ROOT_DIR/release-dist}"

mkdir -p "$RELEASE_DIST_DIR"

for brand in 97 45 55; do
  echo "Building macOS pkg for icons_$brand"
  RELEASE_DIST_DIR="$RELEASE_DIST_DIR" \
  TAURI_BUNDLES=app \
  COPY_APP_BUNDLE=0 \
  COPY_DMG=0 \
  bash "$ROOT_DIR/scripts/build-release-brand.sh" "$brand" mac
done

echo "macOS pkg artifacts copied to: $RELEASE_DIST_DIR"
