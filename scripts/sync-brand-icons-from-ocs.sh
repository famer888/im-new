#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OCS_DIR="${OCS_DIR:-$(cd "$ROOT_DIR/../ocs" && pwd)}"
BRAND_ID="${1:-all}"

if [[ ! -d "$OCS_DIR/.git" ]]; then
  echo "Reference repo not found: $OCS_DIR" >&2
  echo "Set OCS_DIR to the ocs project root." >&2
  exit 1
fi

ICON_FILES=(
  1024x1024.png
  128x128.png
  16x16.png
  24x24.png
  256x256.png
  32x32.png
  48x48.png
  512x512.png
  64x64.png
  icon.icns
  icon.png
  logo.png
)

sync_one_brand() {
  local brand="$1"
  local branch="${brand}.1.7.1"
  local dest="$ROOT_DIR/resources/icons_$brand"

  mkdir -p "$dest"
  echo "Syncing icons_$brand from $OCS_DIR ($branch)"

  for file in "${ICON_FILES[@]}"; do
    if git -C "$OCS_DIR" cat-file -e "$branch:build/icons/$file" 2>/dev/null; then
      git -C "$OCS_DIR" show "$branch:build/icons/$file" > "$dest/$file"
    fi
  done

  if git -C "$OCS_DIR" cat-file -e "$branch:favicon.ico" 2>/dev/null; then
    git -C "$OCS_DIR" show "$branch:favicon.ico" > "$dest/installer.ico"
  fi
}

case "$BRAND_ID" in
  45|55|97) sync_one_brand "$BRAND_ID" ;;
  all)
    for brand in 45 55 97; do
      sync_one_brand "$brand"
    done
    ;;
  *)
    echo "Usage: bash ./scripts/sync-brand-icons-from-ocs.sh [45|55|97|all]" >&2
    exit 1
    ;;
esac

echo "Brand icons synced into resources/icons_*"
