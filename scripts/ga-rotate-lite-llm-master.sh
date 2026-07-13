#!/usr/bin/env bash
# Rotate LiteLLM master key on VPS and sync to Infomaniak + local cloud-node/.env.
#
# Usage:
#   ./scripts/ga-rotate-lite-llm-master.sh
#   DRY_RUN=1 ./scripts/ga-rotate-lite-llm-master.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_SSH="${VPS_SSH:-}"
VPS_SSH_KEY="${VPS_SSH_KEY:-}"
ENV_FILE="${ROOT}/cloud-node/.env.deploy"
REMOTE_ENV="sites/api.exosites.ch/.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SSH_BASE=(ssh -i "$VPS_SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

if [[ ! -f "$VPS_SSH_KEY" ]]; then
  echo -e "${RED}Missing VPS key: ${VPS_SSH_KEY}${NC}"
  exit 1
fi

NEW_KEY="sk-exo-$(openssl rand -hex 24)"
echo -e "${YELLOW}New master key prefix: ${NEW_KEY:0:16}…${NC}"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "DRY_RUN — would update VPS ~/exo-llm/.env, broker, Infomaniak, cloud-node/.env"
  exit 0
fi

echo "==> VPS: update .env + restart LiteLLM + broker"
"${SSH_BASE[@]}" "$VPS_SSH" bash -s <<EOF
set -euo pipefail
cd ~/exo-llm
if grep -q '^LITELLM_MASTER_KEY=' .env; then
  sed -i.bak "s|^LITELLM_MASTER_KEY=.*|LITELLM_MASTER_KEY=${NEW_KEY}|" .env
else
  echo "LITELLM_MASTER_KEY=${NEW_KEY}" >> .env
fi
chmod +x scripts/*.sh 2>/dev/null || true
./scripts/enable-sort-credentials-broker.sh
EOF

if [[ -f "${ROOT}/cloud-node/.env" ]]; then
  if grep -q '^LITELLM_MASTER_KEY=' "${ROOT}/cloud-node/.env"; then
    sed -i.bak "s|^LITELLM_MASTER_KEY=.*|LITELLM_MASTER_KEY=${NEW_KEY}|" "${ROOT}/cloud-node/.env"
  else
    echo "LITELLM_MASTER_KEY=${NEW_KEY}" >> "${ROOT}/cloud-node/.env"
  fi
  echo -e "${GREEN}Updated cloud-node/.env${NC}"
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  if [[ -n "${SSH_USER:-}" && -n "${SSH_HOST:-}" ]]; then
    echo "==> Infomaniak: update LITELLM_MASTER_KEY in remote .env"
    run_ssh() {
      if [[ -n "${SSH_PASSWORD:-}" ]] && command -v sshpass >/dev/null 2>&1; then
        sshpass -p "${SSH_PASSWORD}" ssh -o StrictHostKeyChecking=accept-new "${SSH_USER}@${SSH_HOST}" "$@"
      else
        ssh -o StrictHostKeyChecking=accept-new "${SSH_USER}@${SSH_HOST}" "$@"
      fi
    }
    run_ssh "cd ${REMOTE_ENV%/.env} && \
      if grep -q '^LITELLM_MASTER_KEY=' .env; then \
        sed -i.bak 's|^LITELLM_MASTER_KEY=.*|LITELLM_MASTER_KEY=${NEW_KEY}|' .env; \
      else \
        echo 'LITELLM_MASTER_KEY=${NEW_KEY}' >> .env; \
      fi"
    echo -e "${YELLOW}Restart Node in Infomaniak Manager → api.exosites.ch (optional — desktop uses VPS broker)${NC}"
  fi
fi

echo ""
echo -e "${GREEN}Rotation complete.${NC} Verify:"
echo "  ./scripts/verify-sort-ga-readiness.sh"
