#!/usr/bin/env bash
# Cloud API release gate — deploy cloud-node + migrations + smoke tests.
#
# Usage:
#   ./scripts/release-cloud-api.sh
#   UPLOAD_ENV=1 ./scripts/release-cloud-api.sh   # push local cloud-node/.env
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ROOT}/cloud-node/.env.deploy"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing ${ENV_FILE} — copy cloud-node/.env.deploy.example and fill SSH + REMOTE_PATH."
  exit 1
fi

echo "==> Deploy cloud-node (migrations 002–004)"
DEPLOY_EXIT=0
VERIFY_AFTER_DEPLOY="${VERIFY_AFTER_DEPLOY:-1}" UPLOAD_ENV="${UPLOAD_ENV:-0}" \
  bash scripts/deploy-cloud-api.sh || DEPLOY_EXIT=$?

if [[ "${DEPLOY_EXIT:-0}" -ne 0 ]]; then
  echo ""
  echo "Deploy verify failed — if SKIP_REMOTE_NPM=1, restart Node in Infomaniak Manager, then:"
  echo "  VERIFY_AFTER=1 ./scripts/restart-cloud-api.sh"
  exit "${DEPLOY_EXIT}"
fi

echo ""
echo "Cloud API release gate passed."
echo "Next: run GO SYNC E2E smoke per docs/runbooks/go-sync-e2e-smoke.md"
