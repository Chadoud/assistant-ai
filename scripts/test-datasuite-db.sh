#!/usr/bin/env bash
# Test MariaDB read-only user from api.exosites.ch (after phpMyAdmin grants).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_NODE="${ROOT}/cloud-node/.env.deploy"
ENV_DB="${ROOT}/datasuite/.env.db"

PASS="${DATASUITE_DB_PASSWORD:-${DATASUITE_RO_PASSWORD:-}}"
USER="${DATASUITE_DB_USER:-${DATASUITE_RO_USER:-}}"

if [[ -f "$ENV_DB" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_DB"
  set +a
  PASS="${DATASUITE_DB_PASSWORD:-$PASS}"
  USER="${DATASUITE_DB_USER:-$USER}"
fi

if [[ -z "$PASS" ]]; then
  echo "Set DATASUITE_DB_PASSWORD or fill datasuite/.env.db"
  exit 1
fi

USER="${USER:-YOUR_IK_ID_datasuite}"

set -a
# shellcheck disable=SC1090
source "$ENV_NODE"
set +a

run_ssh() {
  sshpass -p "${SSH_PASSWORD}" ssh -o StrictHostKeyChecking=accept-new \
    "${SSH_USER}@${SSH_HOST}" "$@"
}

run_ssh "cd sites/api.exosites.ch && DATASUITE_DB_USER='${USER}' DATASUITE_DB_PASSWORD='${PASS}' node scripts/test-datasuite-db.js"
