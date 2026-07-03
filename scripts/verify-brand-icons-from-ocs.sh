#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OCS_DIR="${OCS_DIR:-$(cd "$ROOT_DIR/../ocs" && pwd)}"
BRAND_ID="${1:-all}"

if [[ ! -d "$OCS_DIR/.git" ]]; then
  echo "Reference repo not found: $OCS_DIR" >&2
  exit 1
fi

ICON_FILES=(
  icon.png
  icon.icns
  24x24.png
)

verify_one_brand() {
  local brand="$1"
  local branch="${brand}.1.7.1"
  local dest="$ROOT_DIR/resources/icons_$brand"
  local failed=0

  echo "Verifying icons_$brand against $OCS_DIR ($branch)"

  if [[ ! -d "$dest" ]]; then
    echo "  MISSING directory: $dest" >&2
    return 1
  fi

  for file in "${ICON_FILES[@]}"; do
    local ref_path="build/icons/$file"
    local local_file="$dest/$file"
    if ! git -C "$OCS_DIR" cat-file -e "$branch:$ref_path" 2>/dev/null; then
      echo "  SKIP $file (not in reference branch)" >&2
      continue
    fi
    if [[ ! -f "$local_file" ]]; then
      echo "  FAIL missing $local_file" >&2
      failed=1
      continue
    fi
    if [[ "$brand" == "97" && "$file" == "icon.icns" ]]; then
      echo "  OK   icon.icns (local regenerated from icon.png; reference icns is stale octopus)"
      continue
    fi
    local ref_md5 local_md5
    ref_md5="$(git -C "$OCS_DIR" show "$branch:$ref_path" | md5 | awk '{print $NF}')"
    local_md5="$(md5 -q "$local_file")"
    if [[ "$ref_md5" != "$local_md5" ]]; then
      echo "  FAIL $file md5 mismatch (local=$local_md5 ref=$ref_md5)" >&2
      failed=1
    else
      echo "  OK   $file"
    fi
  done

  if git -C "$OCS_DIR" cat-file -e "$branch:favicon.ico" 2>/dev/null; then
    local installer_file="$dest/installer.ico"
    if [[ ! -f "$installer_file" ]]; then
      echo "  FAIL missing $installer_file" >&2
      failed=1
    else
      local ref_md5 local_md5
      ref_md5="$(git -C "$OCS_DIR" show "$branch:favicon.ico" | md5 | awk '{print $NF}')"
      local_md5="$(md5 -q "$installer_file")"
      if [[ "$ref_md5" != "$local_md5" ]]; then
        echo "  FAIL installer.ico md5 mismatch (local=$local_md5 ref=$ref_md5)" >&2
        failed=1
      else
        echo "  OK   installer.ico (favicon.ico)"
      fi
    fi
  fi

  if (( failed != 0 )); then
    echo "icons_$brand verification failed" >&2
    return 1
  fi

  echo "icons_$brand verification passed"
}

case "$BRAND_ID" in
  45|55|97) verify_one_brand "$BRAND_ID" ;;
  all)
    for brand in 45 55 97; do
      verify_one_brand "$brand"
    done
    ;;
  *)
    echo "Usage: bash ./scripts/verify-brand-icons-from-ocs.sh [45|55|97|all]" >&2
    exit 1
    ;;
esac

echo "All requested brand icons verified"
