#!/usr/bin/env bash
# Sync infra + backend sources to ~/exo-llm on the LLM VPS (flat layout).
# Usage from repo root:
#   SSH_KEY=~/.ssh/exo-llm bash infra/llm/scripts/rsync-to-vps.sh ubuntu@YOUR_LLM_VPS_IPV4
set -euo pipefail

TARGET="${1:?Usage: rsync-to-vps.sh user@host}"
LLM_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$LLM_ROOT/../.." && pwd)"
SSH_KEY="${SSH_KEY:-}"
if [[ -n "$SSH_KEY" ]]; then
  RSYNC_RSH="ssh -i \"$SSH_KEY\" -o StrictHostKeyChecking=accept-new"
else
  RSYNC_RSH="ssh -o StrictHostKeyChecking=accept-new"
fi

echo "==> Sync infra/llm -> ${TARGET}:~/exo-llm/"
rsync -avz --delete \
  -e "$RSYNC_RSH" \
  --exclude node_modules --exclude '.env' --exclude '__pycache__' \
  "$REPO/infra/llm/" "${TARGET}:~/exo-llm/"

echo "==> Sync backend sources -> ${TARGET}:~/exo-llm/backend/"
rsync -avz \
  -e "$RSYNC_RSH" \
  --exclude __pycache__ --exclude '.pytest_cache' --exclude '.coverage' \
  --exclude build --exclude dist --exclude '.venv' --exclude venv \
  --exclude crash_reports --exclude '*.pyc' \
  "$REPO/backend/" "${TARGET}:~/exo-llm/backend/"

echo "==> Done. On VPS: cd ~/exo-llm && ./scripts/fix-staging-vision.sh"
