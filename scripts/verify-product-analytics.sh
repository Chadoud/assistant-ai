#!/usr/bin/env bash
# Verify product analytics ingest on api.exosites.ch (migration 005 + routes).
# Rows use app_version=verify / platform=script and are excluded from DataSuite retention views.
#
# Health-only (no DB writes): VERIFY_ANALYTICS_SKIP_POST=1 ./scripts/verify-product-analytics.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="${EXOSITES_CLOUD_URL:-https://api.exosites.ch}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

fail() { echo -e "${RED}$*${NC}" >&2; exit 1; }
ok() { echo -e "${GREEN}$*${NC}"; }

echo "Checking health features…"
HEALTH=$(curl -fsS "${API_BASE}/health" || fail "health unreachable")
echo "$HEALTH" | grep -q '"product_analytics":true' || fail "product_analytics feature false — run migration 005"

echo "Checking client-config…"
CFG=$(curl -fsS "${API_BASE}/v1/public/client-config" || fail "client-config unreachable")
echo "$CFG" | grep -q '"telemetry_ingest_enabled":true' || fail "telemetry_ingest_enabled false"

if [[ "${VERIFY_ANALYTICS_SKIP_POST:-}" == "1" ]]; then
  ok "Product analytics endpoints OK on ${API_BASE} (SKIP_POST — no verify rows written)"
  exit 0
fi

INSTANCE_ID="verify-$(date +%s)"
EVENT_BODY=$(cat <<EOF
{
  "instance_id": "${INSTANCE_ID}",
  "app_version": "verify",
  "platform": "script",
  "locale": "en",
  "events": [{ "name": "app_started", "props": { "ui_locale": "en" } }]
}
EOF
)

EVENT_RES=$(curl -fsS -w "\n%{http_code}" -X POST "${API_BASE}/v1/telemetry/events" \
  -H "Content-Type: application/json" \
  -d "$EVENT_BODY") || fail "telemetry events POST failed"
EVENT_CODE=$(echo "$EVENT_RES" | tail -n1)
[[ "$EVENT_CODE" == "200" ]] || fail "telemetry events returned $EVENT_CODE"

FB_BODY=$(cat <<EOF
{
  "instance_id": "${INSTANCE_ID}",
  "app_version": "verify",
  "locale": "en",
  "category": "other",
  "message": "Automated verify script ping — safe to ignore."
}
EOF
)

FB_RES=$(curl -fsS -w "\n%{http_code}" -X POST "${API_BASE}/v1/telemetry/feedback" \
  -H "Content-Type: application/json" \
  -d "$FB_BODY") || fail "feedback POST failed"
FB_CODE=$(echo "$FB_RES" | tail -n1)
[[ "$FB_CODE" == "200" ]] || fail "feedback returned $FB_CODE"

ok "Product analytics ingest OK on ${API_BASE}"
