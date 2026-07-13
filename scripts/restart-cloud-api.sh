#!/usr/bin/env bash
# Restart cloud-node on Infomaniak after rsync (when SKIP_REMOTE_NPM=1 in .env.deploy).
#
# Usage:
#   ./scripts/restart-cloud-api.sh
#   VERIFY_AFTER=1 ./scripts/restart-cloud-api.sh
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
REMOTE_PATH="${REMOTE_PATH:-./sites/api.exosites.ch}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)

run_ssh() {
  if [[ -n "${SSH_PASSWORD:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -p "${SSH_PASSWORD}" ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" "$@"
  else
    ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" "$@"
  fi
}

echo "Restarting cloud-node on ${SSH_USER}@${SSH_HOST}:${REMOTE_PATH} …"

set +e
run_ssh "cd ${REMOTE_PATH} && npm install --omit=dev"
INSTALL_EXIT=$?
set -e

if [[ $INSTALL_EXIT -ne 0 ]]; then
  echo "WARN: remote npm install failed — use Infomaniak Manager → api.exosites.ch → Restart"
fi

run_ssh "cd ${REMOTE_PATH} && (pkill -f 'node server.js' 2>/dev/null || true)" || true
echo ""
echo "Infomaniak panel-managed Node apps ignore SSH pkill."
echo "Required: Infomaniak Manager → Node.js → api.exosites.ch → Restart"
echo "Verify:  ./scripts/verify-cloud-auth-api.sh  (look for features.sort_credentials)"

sleep 3

if [[ "${VERIFY_AFTER:-0}" == "1" ]]; then
  echo "Running verify-cloud-auth + GO SYNC …"
  "${ROOT}/scripts/verify-cloud-auth-api.sh"
fi
