#!/usr/bin/env bash
# Delete throwaway @example.com accounts from production MariaDB (via api.exosites.ch SSH).
#
# Usage:
#   npm run cleanup:test-accounts              # dry run
#   CONFIRM=1 npm run cleanup:test-accounts    # delete
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/cloud-node/.env.deploy"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing ${ENV_FILE}"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${SSH_USER:?Set SSH_USER in .env.deploy}"
: "${SSH_HOST:?Set SSH_HOST in .env.deploy}"
: "${SSH_PASSWORD:?Set SSH_PASSWORD in .env.deploy}"

REMOTE_PATH="${REMOTE_PATH:-sites/api.exosites.ch}"

run_ssh() {
  sshpass -p "${SSH_PASSWORD}" ssh -o StrictHostKeyChecking=accept-new \
    "${SSH_USER}@${SSH_HOST}" "$@"
}

echo "Syncing cleanup script to ${SSH_HOST}…"
sshpass -p "${SSH_PASSWORD}" scp -o StrictHostKeyChecking=accept-new \
  "${ROOT}/cloud-node/scripts/cleanup-test-accounts.js" \
  "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/scripts/cleanup-test-accounts.js"
sshpass -p "${SSH_PASSWORD}" scp -o StrictHostKeyChecking=accept-new \
  "${ROOT}/cloud-node/lib/testAccountCleanup.js" \
  "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/lib/testAccountCleanup.js"

CONFIRM="${CONFIRM:-0}" run_ssh "cd ${REMOTE_PATH} && CONFIRM=${CONFIRM:-0} node scripts/cleanup-test-accounts.js"
