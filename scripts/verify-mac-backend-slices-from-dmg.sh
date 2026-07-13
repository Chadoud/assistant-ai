#!/usr/bin/env bash
# Verify backend slices inside a packaged Exo.dmg.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DMG="${1:-$ROOT/dist-installer/Exo.dmg}"
MOUNT="/tmp/exo-verify-$$"

cleanup() {
  hdiutil detach "$MOUNT" -force >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ ! -f "$DMG" ]]; then
  echo "::error::DMG not found: $DMG"
  exit 1
fi

mkdir -p "$MOUNT"
hdiutil attach "$DMG" -mountpoint "$MOUNT" -nobrowse -quiet

APP="$(find "$MOUNT" -maxdepth 3 -name 'Exo.app' -type d | head -1)"
if [[ -z "$APP" ]]; then
  echo "::error::Exo.app not found inside DMG mount"
  find "$MOUNT" -maxdepth 3 || true
  exit 1
fi

EXO_MAC_UNIVERSAL="${EXO_MAC_UNIVERSAL:-1}"
EXO_MAC_VERIFY_SLICE_ARCH=1 node "$ROOT/scripts/verify-packaged-app.cjs" "$APP"
