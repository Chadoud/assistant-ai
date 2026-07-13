#!/usr/bin/env bash
# Resolve Flutter binary: FVM pin, PATH, or /tmp/flutter from CI bootstrap.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/mobile"

if [[ -x "$ROOT/.fvm/flutter_sdk/bin/flutter" ]]; then
  FLUTTER="$ROOT/.fvm/flutter_sdk/bin/flutter"
elif command -v flutter >/dev/null 2>&1; then
  FLUTTER="flutter"
elif [[ -x /tmp/flutter/bin/flutter ]]; then
  FLUTTER="/tmp/flutter/bin/flutter"
else
  echo "Flutter SDK not found. Install FVM or Flutter: https://docs.flutter.dev/get-started/install"
  exit 1
fi

exec "$FLUTTER" "$@"
