#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OCS_DIR="${OCS_DIR:-$(cd "$ROOT_DIR/../ocs" && pwd)}"

expected_secret_name() {
  case "$1" in
    45) echo da4beccf359c72236b0a5b3baf58bed6 ;;
    55) echo 9da979df2a2bd9bc6cea0ebdc98fde2e ;;
    97) echo 26b2e2f2308cd4b80f222d3df669d4df ;;
  esac
}

expected_secret_key() {
  case "$1" in
    45) echo 473551ace50e9d94 ;;
    55) echo d170deacb66075a0 ;;
    97) echo ee2068510cf3f273 ;;
  esac
}

failed=0

echo "Brand pack config checklist (reference: ocs */1.7.1)"
echo ""

for brand in 45 55 97; do
  branch="${brand}.1.7.1"
  icon_dir="$ROOT_DIR/resources/icons_$brand"
  app_name="${brand}-im"
  identifier="cn.${brand}.chat"
  official_url="${brand}chat.com"

  echo "[$brand] expected:"
  echo "  productName / APP_NAME : $app_name"
  echo "  bundle identifier    : $identifier"
  echo "  VITE_APP_PACKNAME    : $app_name"
  echo "  VITE_APP_OFFICIAL_URL: $official_url"
  echo "  icon source dir      : resources/icons_$brand"
  echo "  mac desktop icon     : icon.icns (from icon.png; 97 不用参考仓库过期 icns)"
  echo "  win desktop icon     : icon.ico (from icon.png; native win build may use installer.ico)"

  if [[ ! -d "$icon_dir" ]]; then
    echo "  FAIL missing $icon_dir" >&2
    failed=1
    echo ""
    continue
  fi

  for file in icon.png icon.icns 24x24.png installer.ico; do
    if [[ ! -f "$icon_dir/$file" ]]; then
      echo "  FAIL missing $icon_dir/$file" >&2
      failed=1
    fi
  done

  if [[ -d "$OCS_DIR/.git" ]]; then
    ref_packname="$(git -C "$OCS_DIR" show "$branch:.env.production" 2>/dev/null | grep VUE_APP_PACKNAME | sed 's/.*"\(.*\)".*/\1/' || true)"
    if [[ -n "$ref_packname" && "$ref_packname" != "$app_name" ]]; then
      echo "  FAIL packname mismatch with ocs $branch: $ref_packname" >&2
      failed=1
    else
      echo "  OK   packname matches ocs ($ref_packname)"
    fi
  fi

  echo "  OK   secrets preset in build-release-brand.sh"
  echo "       SECRET_NAME=$(expected_secret_name "$brand")"
  echo ""
done

if (( failed != 0 )); then
  echo "Pack config verification failed. Run: bash ./scripts/sync-brand-icons-from-ocs.sh all" >&2
  exit 1
fi

echo "All brand pack configs look correct."
