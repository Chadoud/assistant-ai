#!/usr/bin/env bash
# Desktop release gate — run locally before tagging v*.
#
# Usage:
#   ./scripts/release-desktop.sh
#   ./scripts/release-desktop.sh --skip-cloud   # skip live API smoke
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_CLOUD=0
for arg in "$@"; do
  if [[ "$arg" == "--skip-cloud" ]]; then
    SKIP_CLOUD=1
  fi
done

echo "==> Release resources"
bash scripts/prepare-release-resources.sh

echo "==> Production verify (IPC + handlers)"
node scripts/verify-main-register-handlers.cjs
node scripts/validate-electron-ipc-manifest.cjs

if [[ "$SKIP_CLOUD" == "0" ]]; then
  echo "==> Cloud auth + GO SYNC relay smoke"
  npm run verify:cloud-auth
else
  echo "==> Skipped cloud smoke (--skip-cloud)"
fi

echo "==> Legal URLs"
npm run verify:legal-urls || echo "WARN: legal URLs not reachable — required before store builds"

echo "==> Quality gate (lint, tests — may take several minutes)"
npm run quality

echo ""
echo "Release gate passed. Next:"
echo "  1. ./scripts/bump-version.sh <semver>  (if not done)"
echo "  2. npm run build:mac  (+ package:win on Windows)"
echo "  3. node scripts/verify-packaged-app.cjs"
echo "  4. git tag v<semver> && git push origin v<semver>"
