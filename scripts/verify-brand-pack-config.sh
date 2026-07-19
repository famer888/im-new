#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OCS_DIR="${OCS_DIR:-$(cd "$ROOT_DIR/../ocs" && pwd)}"

expected_secret_name() {
  case "$1" in
    45) echo 27283795908588a8b2e751f4241f562b ;;
    55) echo 2e4632b94cf15b90cb02d40742186d69 ;;
    97) echo 28b41fd6e4226b9e768ffcfc5a482966 ;;
  esac
}

expected_secret_key() {
  case "$1" in
    45) echo d9950fe6bbc4c6a9 ;;
    55) echo 52e61b2052ae35c7 ;;
    97) echo 9a7979a586830fbf ;;
  esac
}

expected_package_code() {
  case "$1" in
    45) echo 4520 ;;
    55) echo 5520 ;;
    97) echo 7100 ;;
  esac
}

expected_electron_nsis_guid() {
  case "$1" in
    45) echo ec684072-a6cf-58c4-8142-6d7a780d0150 ;;
    55) echo d6cb7ce9-cb6f-57a0-9cd7-7b7cef4d38f3 ;;
    97) echo 32559e51-0b7c-570e-9aa8-cca71370f0fa ;;
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
  echo "  win desktop icon     : icon.ico (from installer.ico / favicon.ico)"
  echo "  win nsis installer   : bundle.windows.nsis.installerIcon = installer.ico"
  echo "  win main binary      : mainBinaryName = {brand}-im.exe"
  echo "  win legacy migrate   : NSIS hook uninstalls old Electron (GUID=$(expected_electron_nsis_guid "$brand"))"
  echo "  win install dir      : %LOCALAPPDATA%\\Programs\\${app_name}"

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
  echo "       PACKAGE_CODE=$(expected_package_code "$brand")"
  echo "       OPEN_CHAT_APP_VER=171 (ocs 1.7.1 密钥登记，勿跟包版本 172)"
  echo "  OK   Windows legacy Electron GUID=$(expected_electron_nsis_guid "$brand")"
  echo ""
done

if (( failed != 0 )); then
  echo "Pack config verification failed. Run: bash ./scripts/sync-brand-icons-from-ocs.sh all" >&2
  exit 1
fi

echo "All brand pack configs look correct."
