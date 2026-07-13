#!/usr/bin/env bash
# Install product intelligence cron jobs on api.exosites.ch (Infomaniak Node host).
#
# Jobs:
#   Mon 08:00 — executive digest (stdout → pipe to email/Slack)
#   Daily 07:00 — alert on new crash signatures (exit 1 = notify)
#   Sun 03:00 — prune telemetry (90d) + crashes (180d) + feedback (365d)
#
# Usage:
#   ./scripts/install-product-intelligence-cron.sh
#   DRY_RUN=1 ./scripts/install-product-intelligence-cron.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/cloud-node/.env.deploy"

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

: "${SSH_USER:?Set SSH_USER in .env.deploy}"
: "${SSH_HOST:?Set SSH_HOST in .env.deploy}"
REMOTE_PATH="${REMOTE_PATH:-./sites/api.exosites.ch}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
MARKER="# exosites-product-intelligence-cron"

run_ssh() {
  if [[ -n "${SSH_PASSWORD:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -p "${SSH_PASSWORD}" ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" "$@"
  else
    ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" "$@"
  fi
}

REMOTE_DIR="${REMOTE_PATH#./}"
CRON_BLOCK=$(cat <<EOF
${MARKER}
0 8 * * 1 cd ${REMOTE_DIR} && node scripts/datasuite-weekly-digest.js >> logs/product-digest.log 2>&1
0 7 * * * cd ${REMOTE_DIR} && node scripts/crash-alert-new-signature.js >> logs/crash-alert.log 2>&1; test \$? -eq 1 && echo "NEW CRASH SIGNATURE — see logs/crash-alert.log"
0 3 * * 0 cd ${REMOTE_DIR} && node scripts/prune-product-analytics.js 90 365 >> logs/prune-analytics.log 2>&1
30 3 * * 0 cd ${REMOTE_DIR} && node scripts/prune-crash-reports.js 180 >> logs/prune-crashes.log 2>&1
EOF
)

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo -e "${YELLOW}Would install on ${SSH_USER}@${SSH_HOST}:${NC}"
  echo "$CRON_BLOCK"
  exit 0
fi

echo -e "${GREEN}Installing product intelligence cron on ${SSH_HOST}…${NC}"

run_ssh "mkdir -p ${REMOTE_DIR}/logs && (crontab -l 2>/dev/null | grep -v '${MARKER}' | grep -v 'datasuite-weekly-digest' | grep -v 'crash-alert-new-signature' | grep -v 'prune-product-analytics' | grep -v 'prune-crash-reports' || true; echo '${MARKER}'; echo '0 8 * * 1 cd ${REMOTE_DIR} && node scripts/datasuite-weekly-digest.js >> logs/product-digest.log 2>&1'; echo '0 7 * * * cd ${REMOTE_DIR} && node scripts/crash-alert-new-signature.js >> logs/crash-alert.log 2>&1'; echo '0 3 * * 0 cd ${REMOTE_DIR} && node scripts/prune-product-analytics.js 90 365 >> logs/prune-analytics.log 2>&1'; echo '30 3 * * 0 cd ${REMOTE_DIR} && node scripts/prune-crash-reports.js 180 >> logs/prune-crashes.log 2>&1') | crontab -" || {
  echo -e "${YELLOW}crontab unavailable on this host (common on Infomaniak Node.js).${NC}"
  echo -e "${YELLOW}Add scheduled tasks in Infomaniak Manager → Node.js → api.exosites.ch:${NC}"
  echo "  Mon 08:00  node scripts/datasuite-weekly-digest.js"
  echo "  Daily 07:00  node scripts/crash-alert-new-signature.js"
  echo "  Sun 03:00  node scripts/prune-product-analytics.js 90 365"
  echo "  Sun 03:30  node scripts/prune-crash-reports.js 180"
  exit 0
}

echo -e "${GREEN}Cron installed. Verify:${NC}"
run_ssh "crontab -l | grep -A5 '${MARKER}' || true"
echo ""
echo -e "${YELLOW}Pipe digest/alert logs to Slack or email via Infomaniak cron notifications if available.${NC}"
