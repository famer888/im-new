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

VERSION_NAME="$(node -p 'JSON.parse(require("fs").readFileSync("package.json","utf8")).version')"
VITE_APP_VERSION_NAME="${VITE_APP_VERSION_NAME:-$VERSION_NAME}"
VITE_APP_VERSION_CODE="${VITE_APP_VERSION_CODE:-$(node -e "
  const parts = process.argv[1].split('.').map((part) => Number(part) || 0);
  const [maj = 0, min = 0, pat = 0] = parts;
  console.log(maj * 100 + min * 10 + pat);
" "$VERSION_NAME")}"
VITE_APP_OPEN_CHAT_APP_VER="${VITE_APP_OPEN_CHAT_APP_VER:-$VITE_APP_VERSION_CODE}"

case "$BRAND_ID" in
  45)
    VITE_APP_SECRET_NAME="${VITE_APP_SECRET_NAME:-da4beccf359c72236b0a5b3baf58bed6}"
    VITE_APP_SECRET_KEY="${VITE_APP_SECRET_KEY:-473551ace50e9d94}"
    ;;
  55)
    VITE_APP_SECRET_NAME="${VITE_APP_SECRET_NAME:-9da979df2a2bd9bc6cea0ebdc98fde2e}"
    VITE_APP_SECRET_KEY="${VITE_APP_SECRET_KEY:-d170deacb66075a0}"
    ;;
  97)
    VITE_APP_SECRET_NAME="${VITE_APP_SECRET_NAME:-26b2e2f2308cd4b80f222d3df669d4df}"
    VITE_APP_SECRET_KEY="${VITE_APP_SECRET_KEY:-ee2068510cf3f273}"
    ;;
esac

ICON_SOURCE_DIR="$ROOT_DIR/resources/icons_$BRAND_ID"
ICON_TARGET_REL=".generated-icons/icons_$BRAND_ID"
ICON_TARGET_DIR="$ROOT_DIR/src-tauri/$ICON_TARGET_REL"
BRAND_BACKUP_DIR=""
BRAND_BACKUP_FILES=()

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
  # 对齐旧 im build/icons：以 icon.png 为唯一主源，避免误用 1024x1024 占位图。
  local candidates=(
    "$ICON_SOURCE_DIR/icon.png"
    "$ICON_SOURCE_DIR/logo.png"
    "$ICON_SOURCE_DIR/1024x1024.png"
    "$ICON_SOURCE_DIR/512x512.png"
    "$ICON_SOURCE_DIR/256x256.png"
  )

  for candidate in "${candidates[@]}"; do
    if [[ ! -f "$candidate" ]]; then
      continue
    fi

    read -r width height < <(find_png_size "$candidate")
    if [[ -n "${width:-}" && "$width" == "$height" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
}

ICON_PNG="$(choose_icon_png)"

if [[ -z "$ICON_PNG" ]]; then
  echo "Missing square PNG source icon in: $ICON_SOURCE_DIR" >&2
  exit 1
fi

APP_NAME="${APP_NAME:-${BRAND_ID}-im}"
PKG_IDENTIFIER="${PKG_IDENTIFIER:-cn.$BRAND_ID.chat}"
OFFICIAL_URL="${OFFICIAL_URL:-${BRAND_ID}chat.com}"
TAURI_BUILD_MODE="${TAURI_BUILD_MODE:-production}"
case "$TAURI_BUILD_MODE" in
  production)
    VITE_ENV_NAME="prod"
    ;;
  test|uat)
    VITE_ENV_NAME="$TAURI_BUILD_MODE"
    ;;
  *)
    echo "Unknown TAURI_BUILD_MODE: $TAURI_BUILD_MODE" >&2
    exit 1
    ;;
esac
VITE_PACKNAME="${VITE_APP_PACKNAME:-$BRAND_ID-im}"
RELEASE_DIST_DIR="${RELEASE_DIST_DIR:-$ROOT_DIR/release-dist/$PLATFORM/icons_$BRAND_ID}"
# Keep the temp config beside tauri.conf.json so relative icon paths resolve
# against src-tauri, otherwise Tauri can fall back to the default 97 icons.
TAURI_CONFIG_FILE="$(mktemp "$ROOT_DIR/src-tauri/.tauri-brand-$BRAND_ID.XXXXXX")"
BRAND_BACKUP_DIR="$(mktemp -d "$ROOT_DIR/.brand-source-backup-$BRAND_ID.XXXXXX")"

cleanup_generated() {
  restore_branded_sources
  rm -rf "$ICON_TARGET_DIR"
  rm -rf "$ROOT_DIR/src-tauri/.generated-nsis"
  rm -f "$TAURI_CONFIG_FILE"
  if [[ -n "$BRAND_BACKUP_DIR" ]]; then
    rm -rf "$BRAND_BACKUP_DIR"
  fi
}

trap cleanup_generated EXIT

backup_source_file() {
  local target="$1"
  local rel_path="${target#$ROOT_DIR/}"
  local backup_path="$BRAND_BACKUP_DIR/$rel_path"

  mkdir -p "$(dirname "$backup_path")"
  cp -p "$target" "$backup_path"
  BRAND_BACKUP_FILES+=("$target")
}

restore_branded_sources() {
  local target rel_path backup_path

  for target in "${BRAND_BACKUP_FILES[@]:-}"; do
    rel_path="${target#$ROOT_DIR/}"
    backup_path="$BRAND_BACKUP_DIR/$rel_path"
    if [[ -f "$backup_path" ]]; then
      cp -p "$backup_path" "$target"
    fi
  done

  BRAND_BACKUP_FILES=()
}

apply_branded_sources() {
  local app_icon_source="$ICON_SOURCE_DIR/icon.png"
  local tray_icon_source="$ICON_SOURCE_DIR/24x24.png"
  local target
  local app_icon_targets=(
    "$ROOT_DIR/src/assets/images/common/confirm-app-icon.png"
    "$ROOT_DIR/src/assets/images/common/defalut-icon.png"
    "$ROOT_DIR/src/assets/images/logo/dock.png"
    "$ROOT_DIR/src/assets/images/logo/logo.png"
    "$ROOT_DIR/src/assets/images/login/dock.png"
  )

  if [[ ! -f "$app_icon_source" ]]; then
    echo "Missing app icon source: $app_icon_source" >&2
    exit 1
  fi

  if [[ ! -f "$tray_icon_source" ]]; then
    tray_icon_source="$ICON_PNG"
  fi

  for target in "${app_icon_targets[@]}"; do
    if [[ ! -f "$target" ]]; then
      echo "Missing branded frontend icon target: $target" >&2
      exit 1
    fi
    backup_source_file "$target"
    cp -f "$app_icon_source" "$target"
  done

  target="$ROOT_DIR/src-tauri/icons/tray.png"
  if [[ ! -f "$target" ]]; then
    echo "Missing tray icon target: $target" >&2
    exit 1
  fi
  backup_source_file "$target"
  cp -f "$tray_icon_source" "$target"
}

rm -rf "$ICON_TARGET_DIR"
mkdir -p "$ICON_TARGET_DIR"

cd "$ROOT_DIR"

apply_branded_sources

read -r ICON_WIDTH ICON_HEIGHT < <(find_png_size "$ICON_PNG")
if (( ICON_WIDTH < 512 )); then
  echo "Warning: $ICON_PNG is ${ICON_WIDTH}x${ICON_HEIGHT}; macOS app icons are best from 1024x1024 or 512x512." >&2
fi

echo "Brand icon source PNG: $ICON_PNG"
pnpm tauri icon "$ICON_PNG" --output "$ICON_TARGET_DIR"

HOST_OS="$(uname -s 2>/dev/null || echo unknown)"

# Mac/Win 桌面图标统一以 icon.png 为准生成 icon.icns/icon.ico。
# 旧 im 的 build/icons/icon.icns 在 97 渠道是过期章鱼图，不能覆盖生成结果。
if [[ "$USE_SOURCE_ICNS" == "1" && -f "$ICON_SOURCE_DIR/icon.icns" ]] \
  && file "$ICON_SOURCE_DIR/icon.icns" | grep -q "Mac OS X icon"; then
  cp -f "$ICON_SOURCE_DIR/icon.icns" "$ICON_TARGET_DIR/icon.icns"
  echo "USE_SOURCE_ICNS=1: using icon.icns from $ICON_SOURCE_DIR"
fi

# Win 安装包/桌面 exe 统一用参考项目 favicon.ico（installer.ico），对齐旧 im electron-builder。
if [[ "$PLATFORM" == "win" && -f "$ICON_SOURCE_DIR/installer.ico" ]]; then
  cp -f "$ICON_SOURCE_DIR/installer.ico" "$ICON_TARGET_DIR/installer.ico"
  cp -f "$ICON_SOURCE_DIR/installer.ico" "$ICON_TARGET_DIR/icon.ico"
  echo "Windows build: using installer.ico from $ICON_SOURCE_DIR"
fi

NSIS_HOOK_REL=""
if [[ "$PLATFORM" == "win" ]]; then
  case "$BRAND_ID" in
    45) ELECTRON_NSI_GUID="ec684072-a6cf-58c4-8142-6d7a780d0150" ;;
    55) ELECTRON_NSI_GUID="d6cb7ce9-cb6f-57a0-9cd7-7b7cef4d38f3" ;;
    97) ELECTRON_NSI_GUID="32559e51-0b7c-570e-9aa8-cca71370f0fa" ;;
    *) ELECTRON_NSI_GUID="" ;;
  esac
  if [[ -n "$ELECTRON_NSI_GUID" ]]; then
    NSIS_HOOK_REL=".generated-nsis/electron-migrate-${BRAND_ID}.nsh"
    NSIS_HOOK_FILE="$ROOT_DIR/src-tauri/$NSIS_HOOK_REL"
    mkdir -p "$(dirname "$NSIS_HOOK_FILE")"
    cat > "$NSIS_HOOK_FILE" <<EOF
!define LEGACY_ELECTRON_GUID "${ELECTRON_NSI_GUID}"

!macro NSIS_HOOK_PREINSTALL
  ReadRegStr \$R0 HKCU "Software\\\${LEGACY_ELECTRON_GUID}" "InstallLocation"
  \${If} \$R0 != ""
    StrCpy \$INSTDIR \$R0
  \${Else}
    ReadRegStr \$R0 HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\\${LEGACY_ELECTRON_GUID}" "InstallLocation"
    \${If} \$R0 != ""
      StrCpy \$INSTDIR \$R0
    \${Else}
      StrCpy \$INSTDIR "\$LOCALAPPDATA\\Programs\\${APP_NAME}"
    \${EndIf}
  \${EndIf}

  ReadRegStr \$R1 HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\\${LEGACY_ELECTRON_GUID}" "UninstallString"
  \${If} \$R1 != ""
    ExecWait '\$R1 /S' \$R2
  \${EndIf}
!macroend
EOF
    echo "Windows build: legacy Electron migrate hook -> $NSIS_HOOK_REL"
  fi
fi

node -e '
  const fs = require("fs");
  const path = require("path");
  const [out, productName, identifier, iconDir, platform, nsisHookRel] = process.argv.slice(1);
  const pickNsisIcon = () => {
    for (const name of ["installer.ico", "icon.ico"]) {
      const rel = `${iconDir}/${name}`;
      if (fs.existsSync(path.join("src-tauri", rel))) return rel;
    }
    return `${iconDir}/icon.ico`;
  };
  const bundle = {
    icon: [
      `${iconDir}/32x32.png`,
      `${iconDir}/128x128.png`,
      `${iconDir}/128x128@2x.png`,
      `${iconDir}/icon.icns`,
      `${iconDir}/icon.ico`,
    ],
  };
  if (platform === "win") {
    const nsisIcon = pickNsisIcon();
    const nsis = {
      compression: "zlib",
      installerIcon: nsisIcon,
      installMode: "currentUser",
    };
    if (nsisHookRel) {
      nsis.installerHooks = nsisHookRel;
    }
    bundle.windows = { nsis };
  }
  fs.writeFileSync(out, JSON.stringify({
    productName,
    identifier,
    mainBinaryName: productName,
    bundle,
  }, null, 2));
' "$TAURI_CONFIG_FILE" "$APP_NAME" "$PKG_IDENTIFIER" "$ICON_TARGET_REL" "$PLATFORM" "$NSIS_HOOK_REL"

echo "Building $APP_NAME ($PKG_IDENTIFIER) with icons_$BRAND_ID for $PLATFORM"
echo "  packname=$VITE_PACKNAME officialUrl=$OFFICIAL_URL iconPng=$ICON_PNG"

if [[ "$PLATFORM" == "mac" ]]; then
  APP_NAME="$APP_NAME" \
  PKG_IDENTIFIER="$PKG_IDENTIFIER" \
  TAURI_BUILD_MODE="$TAURI_BUILD_MODE" \
  VITE_APP_ENV="$VITE_ENV_NAME" \
  VITE_APP_BRAND_ID="$BRAND_ID" \
  VITE_APP_PACKNAME="$VITE_PACKNAME" \
  VITE_APP_OFFICIAL_URL="$OFFICIAL_URL" \
  VITE_APP_SECRET_NAME="$VITE_APP_SECRET_NAME" \
  VITE_APP_SECRET_KEY="$VITE_APP_SECRET_KEY" \
  VITE_APP_VERSION_NAME="$VITE_APP_VERSION_NAME" \
  VITE_APP_VERSION_CODE="$VITE_APP_VERSION_CODE" \
  VITE_APP_OPEN_CHAT_APP_VER="$VITE_APP_OPEN_CHAT_APP_VER" \
  RELEASE_DIST_DIR="$RELEASE_DIST_DIR" \
  TAURI_CONFIG="$TAURI_CONFIG_FILE" \
  TAURI_BUNDLES="${TAURI_BUNDLES:-app,dmg}" \
  COPY_APP_BUNDLE="${COPY_APP_BUNDLE:-1}" \
  COPY_DMG="${COPY_DMG:-1}" \
  bash "$ROOT_DIR/scripts/build-release-dist-macos.sh"
else
  TAURI_BUILD_MODE="$TAURI_BUILD_MODE" \
  VITE_APP_ENV="$VITE_ENV_NAME" \
  VITE_APP_BRAND_ID="$BRAND_ID" \
  VITE_APP_PACKNAME="$VITE_PACKNAME" \
  VITE_APP_OFFICIAL_URL="$OFFICIAL_URL" \
  VITE_APP_SECRET_NAME="$VITE_APP_SECRET_NAME" \
  VITE_APP_SECRET_KEY="$VITE_APP_SECRET_KEY" \
  VITE_APP_VERSION_NAME="$VITE_APP_VERSION_NAME" \
  VITE_APP_VERSION_CODE="$VITE_APP_VERSION_CODE" \
  VITE_APP_OPEN_CHAT_APP_VER="$VITE_APP_OPEN_CHAT_APP_VER" \
  RELEASE_DIST_DIR="$RELEASE_DIST_DIR" \
  TAURI_CONFIG="$TAURI_CONFIG_FILE" \
  TAURI_BUNDLES="${TAURI_BUNDLES:-nsis}" \
  COPY_WINDOWS_BINARY="${COPY_WINDOWS_BINARY:-1}" \
  bash "$ROOT_DIR/scripts/build-release-dist-windows.sh"
fi

echo "Brand artifacts copied to: $RELEASE_DIST_DIR"
