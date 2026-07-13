#!/usr/bin/env bash
# Full ship program verification — all engineering gates that do not need devices.
#
# Usage:
#   ./scripts/verify-ship-program.sh
#   ./scripts/verify-ship-program.sh --skip-cloud
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_CLOUD=0
for arg in "$@"; do
  if [[ "$arg" == "--skip-cloud" ]]; then
    SKIP_CLOUD=1
  fi
done

fail=0

run_step() {
  local label="$1"
  shift
  echo ""
  echo "==> ${label}"
  if "$@"; then
    echo "OK: ${label}"
  else
    echo "FAIL: ${label}"
    fail=1
  fi
}

run_step "Desktop IPC + handlers" node scripts/verify-main-register-handlers.cjs
run_step "Electron IPC manifest" node scripts/validate-electron-ipc-manifest.cjs
run_step "Cloud-node unit tests" bash -c 'cd cloud-node && npm test'
run_step "Mobile quality" npm run mobile:quality
run_step "Legal URLs" npm run verify:legal-urls

if [[ "$SKIP_CLOUD" == "0" ]]; then
  run_step "Cloud auth smoke" npm run verify:cloud-auth
else
  echo ""
  echo "==> Skipped cloud smoke (--skip-cloud)"
fi

echo ""
if [[ "$fail" -ne 0 ]]; then
  echo "Ship program verification failed — see docs/SHIP_PROGRAM.md"
  exit 1
fi

echo "Ship program engineering gates passed."
echo "Manual steps remain: deploy relay (if skipped), E2E pairing, counsel sign-off, store submission."
