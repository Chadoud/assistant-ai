#!/usr/bin/env bash
# Poll until production cloud API reports virtual-key mode (after Infomaniak Manager restart).
#
# Usage:
#   ./scripts/wait-for-cloud-api-virtual-keys.sh
#   TIMEOUT_SEC=120 ./scripts/wait-for-cloud-api-virtual-keys.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${CLOUD_API_BASE:-https://api.exosites.ch}"
TIMEOUT_SEC="${TIMEOUT_SEC:-180}"
INTERVAL_SEC="${INTERVAL_SEC:-5}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

deadline=$((SECONDS + TIMEOUT_SEC))
echo -e "${YELLOW}Waiting for ${BASE}/health → sort_credentials_mode=virtual (timeout ${TIMEOUT_SEC}s)…${NC}"
echo -e "${YELLOW}If this hangs: Infomaniak Manager → Node.js → api.exosites.ch → Restart${NC}"
echo ""

while (( SECONDS < deadline )); do
  health="$(curl -fsS "${BASE}/health" 2>/dev/null || echo '{}')"
  if echo "$health" | grep -q '"sort_credentials_mode":"virtual"'; then
    echo -e "${GREEN}Cloud API is in virtual-key mode.${NC}"
    "${ROOT}/scripts/verify-sort-ga-readiness.sh"
    exit $?
  fi
  if echo "$health" | grep -q '"sort_credentials_mode":"delegation"'; then
    echo -e "  … still delegation mode ($(date +%H:%M:%S))"
  else
    echo -e "  … old build still running (no sort_credentials_mode) ($(date +%H:%M:%S))"
  fi
  sleep "$INTERVAL_SEC"
done

echo -e "${RED}Timed out — restart Node in Infomaniak Manager, then re-run this script.${NC}"
exit 1
