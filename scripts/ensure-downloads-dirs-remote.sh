#!/usr/bin/env bash
# Create staging + LKG download dirs on Infomaniak Web SSH (idempotent).
#
# Usage:
#   ./scripts/ensure-downloads-dirs-remote.sh
#
# Requires cloud-node/.env.deploy DOWNLOADS_SSH_* or EXOSITES_DEPLOY_SSH_* + key file.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/cloud-node/.env.deploy"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

USER_NAME="${DOWNLOADS_SSH_USER:-${EXOSITES_DEPLOY_SSH_USER:-}}"
HOST="${DOWNLOADS_SSH_HOST:-${EXOSITES_DEPLOY_SSH_HOST:-}}"
KEY="${DOWNLOADS_SSH_KEY_FILE:-${HOME}/.ssh/exosites_downloads_deploy}"

STAGING="${DOWNLOADS_REMOTE_PATH_STAGING:-./sites/exosites.ch/downloads/exo-assistant-staging}"
LKG="${DOWNLOADS_REMOTE_PATH_LKG:-./sites/exosites.ch/downloads/exo-assistant-lkg}"
PROD="${DOWNLOADS_REMOTE_PATH:-./sites/exosites.ch/downloads/exo-assistant}"

if [[ -z "$USER_NAME" || -z "$HOST" ]]; then
  echo "Set DOWNLOADS_SSH_USER + DOWNLOADS_SSH_HOST in cloud-node/.env.deploy" >&2
  exit 1
fi
if [[ ! -f "$KEY" ]]; then
  echo "Missing SSH key: $KEY" >&2
  exit 1
fi

ssh -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new \
  "${USER_NAME}@${HOST}" \
  "mkdir -p '${STAGING}' '${LKG}' '${PROD}' && ls -la ./sites/exosites.ch/downloads/"

echo "OK — staging + lkg + prod directories present."
echo "Optional GitHub secret EXOSITES_DOWNLOADS_LKG_PATH=${LKG}"
echo "LKG URL (after first promote snapshot): https://exosites.ch/downloads/exo-assistant-lkg/"
