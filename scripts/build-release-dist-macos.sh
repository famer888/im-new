#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${APP_NAME:-97-im}"
PKG_IDENTIFIER="${PKG_IDENTIFIER:-cn.97.chat}"
RELEASE_DIST_DIR="${RELEASE_DIST_DIR:-$ROOT_DIR/release-dist/macos}"
BUILD_TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/ocs-chat-target-macos}"
TAURI_TARGET="${TAURI_TARGET:-}"
TAURI_CONFIG="${TAURI_CONFIG:-}"
TAURI_BUNDLES="${TAURI_BUNDLES:-app,dmg}"
COPY_APP_BUNDLE="${COPY_APP_BUNDLE:-1}"
COPY_DMG="${COPY_DMG:-1}"
TAURI_BUILD_MODE="${TAURI_BUILD_MODE:-production}"

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

# 对齐旧 ocs（electron-builder）：即使没有 Apple 开发者证书，也会做完整 adhoc 整包签名
# （Sealed Resources + 绑定 Info.plist）。Tauri 若跳过签 bundle，只剩 linker-signed，
# macOS 双击校验失败会直接杀掉进程，看起来像“意外退出”，其实不是业务崩溃。
adhoc_sign_macos_app() {
  local app_path="$1"
  local executable_name=""
  local macos_dir="$app_path/Contents/MacOS"
  local entitlements="$ROOT_DIR/src-tauri/entitlements.mac.plist"
  local sign_args=(--force --deep --sign -)

  if [[ ! -d "$app_path" ]]; then
    echo "Cannot sign missing app bundle: $app_path" >&2
    return 1
  fi

  executable_name="$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$app_path/Contents/Info.plist" 2>/dev/null || true)"
  if [[ -n "$executable_name" && -d "$macos_dir" ]]; then
    # 清理历史残留二进制（例如改 mainBinaryName 前留下的 ocs-chat），避免签名/启动混乱。
    for stale in "$macos_dir"/*; do
      [[ -f "$stale" ]] || continue
      [[ "$(basename "$stale")" == "$executable_name" ]] && continue
      rm -f "$stale"
    done
  fi

  # 先清掉不完整签名，再按旧项目风格重签：完整 adhoc（不强制 hardened runtime，
  # 与本机可正常打开的 OCS Chat 55.app 一致）。
  codesign --remove-signature "$app_path" >/dev/null 2>&1 || true
  if [[ -n "$executable_name" && -f "$macos_dir/$executable_name" ]]; then
    codesign --remove-signature "$macos_dir/$executable_name" >/dev/null 2>&1 || true
  fi

  if [[ -f "$entitlements" ]]; then
    sign_args+=(--entitlements "$entitlements")
  fi

  codesign "${sign_args[@]}" "$app_path"
  codesign --verify --deep --strict "$app_path"
  echo "Adhoc signed macOS app (ocs-style): $app_path"
}

recreate_dmg_from_app() {
  local app_path="$1"
  local dmg_out="$2"
  local stage vol_name

  stage="$(mktemp -d /tmp/ocs-chat-dmg-XXXXXX)"
  vol_name="$(basename "$app_path" .app)"
  cp -R "$app_path" "$stage/"
  ln -s /Applications "$stage/Applications"
  rm -f "$dmg_out"
  hdiutil create \
    -volname "$vol_name" \
    -srcfolder "$stage" \
    -ov \
    -format UDZO \
    "$dmg_out" >/dev/null
  chmod 644 "$dmg_out"
  rm -rf "$stage"
  echo "Recreated DMG from signed app: $dmg_out"
}

require_node

cd "$ROOT_DIR"

VERSION="$(json_get version)"

mkdir -p "$RELEASE_DIST_DIR"
mkdir -p "$BUILD_TARGET_DIR"

TAURI_ARGS=(build --bundles "$TAURI_BUNDLES")
if [[ -n "$TAURI_CONFIG" ]]; then
  TAURI_ARGS+=(--config "$TAURI_CONFIG")
fi

if [[ -n "$TAURI_TARGET" ]]; then
  TAURI_ARGS+=(--target "$TAURI_TARGET")
fi

if [[ -n "$TAURI_TARGET" ]]; then
  echo "Building macOS release artifacts for target: $TAURI_TARGET"
else
  echo "Building macOS release artifacts for native host target"
fi
echo "[AUTH-DIAG][build] macOS mode=$TAURI_BUILD_MODE app=$APP_NAME identifier=$PKG_IDENTIFIER bundles=$TAURI_BUNDLES releaseDir=$RELEASE_DIST_DIR"

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

# pkgbuild 会保留 app bundle 内的文件权限；资源文件如果是 700，安装后会变成 root 私有，
# Launchpad/Finder 就读不到图标，所以打包前统一补齐普通用户可读/可进入权限。
chmod -R u+rwX,go+rX "$APP_PATH"
adhoc_sign_macos_app "$APP_PATH"

ARCH_LABEL="${TAURI_TARGET:-$(uname -m)}"
PKG_STAGE_ROOT="/tmp/ocs-chat-pkg-root"
PKG_COMPONENT_PLIST="/tmp/ocs-chat-component.plist"
PKG_ENV_SUFFIX=""

case "$TAURI_BUILD_MODE" in
  test|uat)
    PKG_ENV_SUFFIX="_$TAURI_BUILD_MODE"
    ;;
esac

PKG_OUTPUT_PATH="$RELEASE_DIST_DIR/${APP_NAME}${PKG_ENV_SUFFIX}_${VERSION}_${ARCH_LABEL}.pkg"
DMG_OUTPUT_PATH="$RELEASE_DIST_DIR/${APP_NAME}${PKG_ENV_SUFFIX}_${VERSION}_${ARCH_LABEL}.dmg"

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
chmod 644 "$PKG_OUTPUT_PATH"

if [[ "$COPY_APP_BUNDLE" == "1" ]]; then
  rm -rf "$RELEASE_DIST_DIR/$APP_NAME.app"
  ditto "$APP_PATH" "$RELEASE_DIST_DIR/$APP_NAME.app"
fi

if [[ "$COPY_DMG" == "1" ]]; then
  # Tauri 生成的 dmg 可能仍是签名前快照；用已签名 app 重打，避免安装后双击闪退。
  recreate_dmg_from_app "$APP_PATH" "$DMG_OUTPUT_PATH"
  if [[ -n "$DMG_PATH" && -f "$DMG_PATH" ]]; then
    # 清理 tauri 原始 dmg，避免 release-dist 里留下未签名版本。
    rm -f "$RELEASE_DIST_DIR/$(basename "$DMG_PATH")"
  fi
fi

echo "macOS artifacts copied to: $RELEASE_DIST_DIR"
