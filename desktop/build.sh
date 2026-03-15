#!/usr/bin/env bash
set -euo pipefail

# Build the Go sidecar binary and package the Tauri desktop app.
# Usage: ./build.sh [--dev]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BINARIES_DIR="$SCRIPT_DIR/src-tauri/binaries"

# Detect target triple.
TARGET_TRIPLE="$(rustc -vV | grep 'host:' | cut -d' ' -f2)"
echo "Target triple: $TARGET_TRIPLE"

# Determine the sidecar binary name.
if [[ "$TARGET_TRIPLE" == *"windows"* ]]; then
    SIDECAR_NAME="webmail-api-${TARGET_TRIPLE}.exe"
else
    SIDECAR_NAME="webmail-api-${TARGET_TRIPLE}"
fi

# Build the Go sidecar.
echo "Building Go sidecar..."
cd "$PROJECT_ROOT"
CGO_ENABLED=0 go build -tags embedstatic \
    -o "$BINARIES_DIR/$SIDECAR_NAME" \
    ./cmd/webmail-api

echo "Sidecar built: $BINARIES_DIR/$SIDECAR_NAME"

# Build the frontend (needed for embedstatic).
echo "Building frontend..."
cd "$PROJECT_ROOT/web"
npm ci
npm run build

# Build the Tauri app.
echo "Building Tauri app..."
cd "$SCRIPT_DIR"
cargo tauri build

echo "Done!"
