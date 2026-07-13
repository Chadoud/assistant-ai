#!/usr/bin/env bash
# Smoke-test crash ingest on api.exosites.ch (or EXOSITES_CLOUD_URL).
# Uses app_version=verify / source=script — excluded from release health views.
#
# Requires CRASH_INGEST_TOKEN in env or cloud-node/.env (local curl only).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="${EXOSITES_CLOUD_URL:-https://api.exosites.ch}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

fail() { echo -e "${RED}$*${NC}" >&2; exit 1; }
ok() { echo -e "${GREEN}$*${NC}"; }

TOKEN="${CRASH_INGEST_TOKEN:-}"
if [[ -z "$TOKEN" && -f "${ROOT}/cloud-node/.env" ]]; then
  TOKEN="$(grep -E '^CRASH_INGEST_TOKEN=' "${ROOT}/cloud-node/.env" | head -1 | cut -d= -f2- | tr -d '\r"'"'"' ')"
fi
[[ -n "$TOKEN" ]] || fail "Set CRASH_INGEST_TOKEN or add to cloud-node/.env"

BODY=$(cat <<EOF
{
  "app_version": "verify",
  "environment": "script",
  "source": "script",
  "error_message": "Automated verify-crash-ingest ping — safe to ignore.",
  "platform": "script",
  "ui_locale": "en"
}
EOF
)

RES=$(curl -fsS -w "\n%{http_code}" -X POST "${API_BASE}/v1/crash-reports" \
  -H "Content-Type: application/json" \
  -H "X-Crash-Token: ${TOKEN}" \
  -d "$BODY") || fail "crash POST failed (network)"
CODE=$(echo "$RES" | tail -n1)
[[ "$CODE" == "200" ]] || fail "crash ingest returned HTTP ${CODE}"

ok "Crash ingest OK on ${API_BASE}"
