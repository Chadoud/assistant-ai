#!/usr/bin/env bash
# Run Flutter on the first available iOS simulator/device (not literal "-d ios").
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FLUTTER="$ROOT/scripts/mobile-flutter.sh"

DEVICE_JSON="$("$FLUTTER" devices --machine 2>/dev/null || true)"
DEVICE_ID="$(DEVICE_JSON="$DEVICE_JSON" python3 - <<'PY'
import json, os, sys
raw = os.environ.get("DEVICE_JSON") or "[]"
try:
    devices = json.loads(raw)
except Exception:
    devices = []
ios = [
    d for d in devices
    if d.get("targetPlatform") == "ios" or d.get("platformType") == "ios"
]
for d in ios:
    did = d.get("id")
    if did:
        print(did)
        sys.exit(0)
sys.exit(1)
PY
)" || true

if [[ -z "${DEVICE_ID:-}" ]]; then
  DEVICE_ID="$("$FLUTTER" devices 2>/dev/null | awk -F'•' '/• ios/ {gsub(/^ +| +$/,"",$2); print $2; exit}')"
fi

if [[ -z "${DEVICE_ID:-}" ]]; then
  echo "No iOS simulator/device found. Start one with: open -a Simulator"
  echo "Then: bash scripts/mobile-flutter.sh devices"
  exit 1
fi

echo "Using iOS device: $DEVICE_ID"
exec "$FLUTTER" run -d "$DEVICE_ID" "$@"
