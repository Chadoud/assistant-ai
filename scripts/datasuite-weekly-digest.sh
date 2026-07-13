#!/usr/bin/env bash
# Run weekly DataSuite digest on api.exosites.ch (stdout).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_NODE="${ROOT}/cloud-node/.env.deploy"

set -a
# shellcheck disable=SC1090
source "$ENV_NODE"
set +a

run_ssh() {
  sshpass -p "${SSH_PASSWORD}" ssh -o StrictHostKeyChecking=accept-new \
    "${SSH_USER}@${SSH_HOST}" "$@"
}

run_ssh "cd sites/api.exosites.ch && node scripts/datasuite-weekly-digest.js"
