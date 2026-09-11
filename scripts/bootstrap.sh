#!/usr/bin/env bash
# bootstrap.sh — verify development environment for wine-black-contract
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓${NC} $1"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $1"; }
fail() { echo -e "${RED}  ✗${NC} $1"; FAILED=1; }

FAILED=0

echo ""
echo "Checking development environment for wine-black-contract..."
echo ""

# Rust
if command -v rustc &>/dev/null; then
  RUST_VERSION=$(rustc --version)
  ok "Rust: $RUST_VERSION"
else
  fail "Rust not found. Install from https://rustup.rs"
fi

# Cargo
if command -v cargo &>/dev/null; then
  ok "Cargo: $(cargo --version)"
else
  fail "Cargo not found."
fi

# wasm32v1-none target
if rustup target list --installed 2>/dev/null | grep -q "wasm32v1-none"; then
  ok "WASM target: wasm32v1-none installed"
else
  warn "WASM target wasm32v1-none not installed. Running: rustup target add wasm32v1-none"
  rustup target add wasm32v1-none
  ok "WASM target installed"
fi

# Stellar CLI
if command -v stellar &>/dev/null; then
  ok "Stellar CLI: $(stellar --version)"
else
  fail "Stellar CLI not found. Install from https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup"
fi

# Node.js (for bot)
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version | sed 's/v//')
  MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
  if [ "$MAJOR" -ge 18 ]; then
    ok "Node.js: v$NODE_VERSION"
  else
    warn "Node.js v$NODE_VERSION is below the minimum (18). Upgrade recommended."
  fi
else
  warn "Node.js not found (only needed for the settlement bot)."
fi

echo ""

if [ "$FAILED" -eq 1 ]; then
  echo -e "${RED}Some requirements are missing. Fix the issues above before continuing.${NC}"
  exit 1
else
  echo -e "${GREEN}All required tools are present. You're ready to contribute!${NC}"
  echo ""
  echo "Next steps:"
  echo "  cd contracts/wine-black && cargo test    # run the test suite"
  echo "  stellar contract build                 # build the WASM artifact"
fi
