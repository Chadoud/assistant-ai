#!/usr/bin/env bash
# Mobile release gate — run before tagging mobile-v*.
#
# Usage:
#   ./scripts/release-mobile.sh
#   ./scripts/release-mobile.sh --skip-cloud   # skip live relay smoke
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_CLOUD=0
for arg in "$@"; do
  if [[ "$arg" == "--skip-cloud" ]]; then
    SKIP_CLOUD=1
  fi
done

echo "==> Mobile platform bootstrap"
bash mobile/setup.sh

echo "==> Mobile quality (analyze + test)"
npm run mobile:analyze
npm run mobile:test

if [[ "$SKIP_CLOUD" == "0" ]]; then
  echo "==> GO SYNC relay smoke (production API)"
  npm run verify:go-sync
else
  echo "==> Skipped cloud smoke (--skip-cloud)"
fi

echo "==> Legal URLs (store blocker)"
npm run verify:legal-urls || echo "WARN: legal URLs not reachable — required before store builds"

echo ""
echo "Mobile release gate passed. Next:"
echo "  1. ./scripts/bump-mobile-version.sh <semver> [build]"
echo "  2. Configure CI secrets per docs/MOBILE_CI_SECRETS.md"
echo "  3. git tag mobile-v<semver> && git push origin mobile-v<semver>"
echo "  4. GO SYNC pairing smoke: docs/runbooks/go-sync-e2e-smoke.md"
