#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NVM_SH="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
REQUIRED_RUST_TARGET="x86_64-apple-darwin"

if [[ ! -s "$NVM_SH" ]]; then
  echo "nvm not found: $NVM_SH" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$NVM_SH"

cd "$ROOT_DIR"
nvm use >/dev/null

if ! rustup target list --installed | grep -qx "$REQUIRED_RUST_TARGET"; then
  echo "Installing missing Rust target: $REQUIRED_RUST_TARGET"
  rustup target add "$REQUIRED_RUST_TARGET"
fi

pnpm release:dist:mac:universal
