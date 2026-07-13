#!/usr/bin/env bash
# Copy infra/llm GA bundle to the staging VPS (requires SSH).
#
# Usage:
#   VPS_SSH=user@YOUR_LLM_VPS_IPV4 ./scripts/package-llm-ga-to-vps.sh
#   VPS_SSH=user@host ./scripts/package-llm-ga-to-vps.sh --run-enable
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_SSH="${VPS_SSH:-}"
VPS_SSH_KEY="${VPS_SSH_KEY:-}"
RUN_ENABLE=0
RUN_QUEUE=0
for arg in "$@"; do
  case "$arg" in
    --run-enable) RUN_ENABLE=1 ;;
    --run-enable-queue) RUN_QUEUE=1 ;;
  esac
done

if [[ -z "$VPS_SSH" ]]; then
  echo "Set VPS_SSH=user@YOUR_LLM_VPS_IPV4"
  exit 1
fi

SSH_BASE=(ssh -i "$VPS_SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
RSYNC_SSH="ssh -i \"$VPS_SSH_KEY\" -o StrictHostKeyChecking=accept-new"

if [[ ! -f "$VPS_SSH_KEY" ]]; then
  echo "Missing VPS key: ${VPS_SSH_KEY}"
  echo "Set VPS_SSH_KEY to your VPS private key path."
  exit 1
fi

echo "==> Syncing infra/llm → ${VPS_SSH}:~/exo-llm/"
"${SSH_BASE[@]}" "$VPS_SSH" 'mkdir -p ~/exo-llm'
rsync -avz --delete \
  --exclude .env \
  --exclude 'compose/.env' \
  -e "$RSYNC_SSH" \
  "${ROOT}/infra/llm/" "${VPS_SSH}:~/exo-llm/"

echo "==> Uploaded. On the VPS run:"
echo "    cd ~/exo-llm && chmod +x scripts/*.sh && ./scripts/enable-virtual-keys-staging.sh"

if [[ "$RUN_ENABLE" -eq 1 ]]; then
  "${SSH_BASE[@]}" "$VPS_SSH" \
    'cd ~/exo-llm && chmod +x scripts/*.sh && ./scripts/enable-virtual-keys-staging.sh && ./scripts/enable-sort-credentials-broker.sh'
fi

if [[ "$RUN_QUEUE" -eq 1 ]]; then
  "${SSH_BASE[@]}" "$VPS_SSH" \
    "sed -i 's/\r$//' ~/exo-llm/scripts/*.sh 2>/dev/null || true; cd ~/exo-llm && chmod +x scripts/*.sh && ./scripts/enable-sort-queue-staging.sh"
fi
