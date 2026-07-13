#!/usr/bin/env bash
# Verify hosted Privacy and Terms URLs resolve (HTTP 200, HTTPS).
#
# Usage:
#   ./scripts/verify-legal-urls.sh
#   PRIVACY_URL=https://... TERMS_URL=https://... ./scripts/verify-legal-urls.sh
set -euo pipefail

PRIVACY_URL="${PRIVACY_URL:-https://exosites.ch/eng/app-privacy}"
TERMS_URL="${TERMS_URL:-https://exosites.ch/eng/app-terms}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

fail=0

check_url() {
  local label="$1"
  local url="$2"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' -L --max-time 20 "$url" || echo 000)"
  if [[ "$code" == "200" ]]; then
    echo -e "${GREEN}✓${NC} ${label} → ${url} (HTTP ${code})"
  else
    echo -e "${RED}✗${NC} ${label} → ${url} (HTTP ${code})"
    fail=1
  fi
}

echo "Legal URL verify"
echo ""
check_url "Privacy policy" "$PRIVACY_URL"
check_url "Terms of service" "$TERMS_URL"

echo ""
if [[ "$fail" -ne 0 ]]; then
  echo -e "${YELLOW}Publish pages per docs/runbooks/legal-publish.md before store submission.${NC}"
  exit 1
fi
echo -e "${GREEN}Legal URLs reachable.${NC}"
