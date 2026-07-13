#!/usr/bin/env bash
# Remove mistaken datasuite deploy from Node.js SSH (wrong host — PHP runs on Web FTP).
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

: "${SSH_USER:?Set SSH_USER in cloud-node/.env.deploy}"
: "${SSH_HOST:?Set SSH_HOST in cloud-node/.env.deploy}"

ORPHAN="./sites/datasuite.exosites.ch"

run_ssh() {
  if [[ -n "${SSH_PASSWORD:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -p "${SSH_PASSWORD}" ssh -o StrictHostKeyChecking=accept-new \
      "${SSH_USER}@${SSH_HOST}" "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new "${SSH_USER}@${SSH_HOST}" "$@"
  fi
}

echo "Removing orphan ${ORPHAN} from Node SSH (${SSH_HOST})…"
if run_ssh "test -d ${ORPHAN}" 2>/dev/null; then
  run_ssh "rm -rf ${ORPHAN}"
  echo "removed ${ORPHAN}"
else
  echo "already clean — only api.exosites.ch under sites/"
fi
run_ssh "ls -la sites/"
