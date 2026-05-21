#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_BUILD_MODE="${TAURI_BUILD_MODE:-production}"

case "$TAURI_BUILD_MODE" in
  test)
    BUILD_CMD=(pnpm build:test)
    ;;
  uat)
    BUILD_CMD=(pnpm build:uat)
    ;;
  production)
    BUILD_CMD=(pnpm build)
    ;;
  *)
    echo "Unknown TAURI_BUILD_MODE: $TAURI_BUILD_MODE" >&2
    echo "Expected one of: production, test, uat" >&2
    exit 1
    ;;
esac

echo "Running beforeBuildCommand with TAURI_BUILD_MODE=$TAURI_BUILD_MODE"

cd "$ROOT_DIR"
exec "${BUILD_CMD[@]}"
