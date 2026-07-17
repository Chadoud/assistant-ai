#!/usr/bin/env bash
# Mobile release gate — run before tagging mobile-v*.
# On success writes .git/exo-release-gate (required by pre-push for mobile-v* tags).
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

# Mobile has no Mac DMG packaging step; stamp packaging=ok after quality.
bash scripts/write-release-gate.sh mobile

MOBILE_VER="$(grep -E '^version:' mobile/pubspec.yaml | head -1 | sed -E 's/^version:[[:space:]]*([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
echo ""
echo "Mobile release gate passed (stamp written for mobile-v${MOBILE_VER} @ HEAD)."
echo "If you still need to bump: ./scripts/bump-mobile-version.sh <semver> [build], commit, then re-run this script."
echo "Next (version already correct):"
echo "  1. git tag mobile-v${MOBILE_VER} && git push origin mobile-v${MOBILE_VER}"
echo "  2. Configure CI secrets per docs/MOBILE_CI_SECRETS.md if needed"
echo "  3. GO SYNC pairing smoke: docs/runbooks/go-sync-e2e-smoke.md"
