#!/usr/bin/env bash
# Flip Infomaniak cloud-node to GA mode: SORT_LLM_ALLOW_MASTER_DELEGATION=0
# Prerequisite: LiteLLM /key/generate works (run enable-virtual-keys-staging.sh on VPS first).
#
# Usage:
#   ./scripts/ga-disable-master-delegation-infomaniak.sh
#   ROTATE_MASTER=1 ./scripts/ga-disable-master-delegation-infomaniak.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/cloud-node/.env.deploy"
REMOTE_ENV="sites/api.exosites.ch/.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}Missing ${ENV_FILE}${NC}"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${SSH_USER:?}"
: "${SSH_HOST:?}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
run_ssh() {
  if [[ -n "${SSH_PASSWORD:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -p "${SSH_PASSWORD}" ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" "$@"
  else
    ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" "$@"
  fi
}

echo -e "${YELLOW}Setting SORT_LLM_ALLOW_MASTER_DELEGATION=0 on Infomaniak…${NC}"
run_ssh "cd ${REMOTE_ENV%/.env} && \
  if grep -q '^SORT_LLM_ALLOW_MASTER_DELEGATION=' .env; then \
    sed -i.bak 's|^SORT_LLM_ALLOW_MASTER_DELEGATION=.*|SORT_LLM_ALLOW_MASTER_DELEGATION=0|' .env; \
  else \
    echo 'SORT_LLM_ALLOW_MASTER_DELEGATION=0' >> .env; \
  fi && grep '^SORT_LLM_ALLOW_MASTER_DELEGATION=' .env"

if [[ -f "${ROOT}/cloud-node/.env" ]]; then
  if grep -q '^SORT_LLM_ALLOW_MASTER_DELEGATION=' "${ROOT}/cloud-node/.env"; then
    sed -i.bak 's|^SORT_LLM_ALLOW_MASTER_DELEGATION=.*|SORT_LLM_ALLOW_MASTER_DELEGATION=0|' "${ROOT}/cloud-node/.env"
  else
    echo 'SORT_LLM_ALLOW_MASTER_DELEGATION=0' >> "${ROOT}/cloud-node/.env"
  fi
fi

echo -e "${GREEN}Done.${NC} ${YELLOW}Infomaniak Manager → Node.js → api.exosites.ch → Restart${NC}"
echo "Then: ./scripts/verify-sort-ga-readiness.sh"
