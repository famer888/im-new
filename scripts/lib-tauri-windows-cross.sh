# shellcheck shell=bash
# Shared helpers for Windows (MSVC) Tauri builds from macOS / Linux hosts.

tauri_windows_prepend_homebrew_llvm_path() {
  local host="${1:-$(uname -s 2>/dev/null || echo unknown)}"
  if [[ "$host" != "Darwin" ]]; then
    return 0
  fi
  local p
  for p in /opt/homebrew/opt/llvm/bin /usr/local/opt/llvm/bin; do
    if [[ -d "$p" ]]; then
      export PATH="$p:$PATH"
      return 0
    fi
  done
}

# Print the cargo runner binary name for `tauri build --runner …`.
tauri_windows_runner_for_host() {
  local host="$1"
  local target="$2"
  case "$host" in
    MINGW* | MSYS* | CYGWIN*)
      printf '%s\n' "cargo"
      ;;
    *)
      if [[ "$target" == *pc-windows-msvc* ]]; then
        printf '%s\n' "cargo-xwin"
      else
        printf '%s\n' "cargo"
      fi
      ;;
  esac
}

tauri_windows_require_cross_compile_deps() {
  local target="$1"
  [[ "$target" != *pc-windows-msvc* ]] && return 0

  local missing=0
  if ! command -v cargo-xwin >/dev/null 2>&1; then
    echo "未找到 cargo-xwin。在 macOS/Linux 上打 MSVC 目标需要: cargo install --locked cargo-xwin" >&2
    missing=1
  fi
  if ! command -v makensis >/dev/null 2>&1; then
    echo "未找到 makensis（NSIS）。macOS: brew install nsis" >&2
    missing=1
  fi
  if ! command -v llvm-rc >/dev/null 2>&1; then
    echo "未找到 llvm-rc（LLVM）。macOS: brew install llvm（并把 /opt/homebrew/opt/llvm/bin 加入 PATH，或依赖调用方脚本自动注入）" >&2
    missing=1
  fi
  if ! rustup target list --installed 2>/dev/null | grep -qFx "x86_64-pc-windows-msvc"; then
    echo "未安装 Rust Windows 目标。执行: rustup target add x86_64-pc-windows-msvc" >&2
    missing=1
  fi
  if ((missing)); then
    exit 1
  fi
}
