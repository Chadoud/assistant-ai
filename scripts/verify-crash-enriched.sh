#!/usr/bin/env bash
# Smoke-test enriched crash payload (migration 012+ fields).
# Skips gracefully when API returns 422 for unknown fields (pre-migration).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="${EXOSITES_CLOUD_URL:-https://api.exosites.ch}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

fail() { echo -e "${RED}$*${NC}" >&2; exit 1; }
ok() { echo -e "${GREEN}$*${NC}"; }
warn() { echo -e "${YELLOW}$*${NC}"; }

TOKEN="${CRASH_INGEST_TOKEN:-}"
if [[ -z "$TOKEN" && -f "${ROOT}/cloud-node/.env" ]]; then
  TOKEN="$(grep -E '^CRASH_INGEST_TOKEN=' "${ROOT}/cloud-node/.env" | head -1 | cut -d= -f2- | tr -d '\r"'"'"' ')"
fi
[[ -n "$TOKEN" ]] || fail "Set CRASH_INGEST_TOKEN"

INSTANCE_ID="verify-enriched-$(date +%s)"
SESSION_ID="verify-session-$(date +%s)"
DEDUPE="verify-dedupe-${SESSION_ID}"

BODY=$(cat <<EOF
{
  "app_version": "verify",
  "environment": "script",
  "source": "script",
  "error_message": "Enriched verify ping — safe to ignore.",
  "platform": "script",
  "ui_locale": "en",
  "instance_id": "${INSTANCE_ID}",
  "session_id": "${SESSION_ID}",
  "active_feature": "assistant",
  "active_tab": "assistant",
  "intent_bucket": "messaging_whatsapp",
  "tool_name": "send_message",
  "dedupe_key": "${DEDUPE}",
  "last_events_json": "[{\"ts\":1,\"type\":\"tool\",\"action\":\"send_message_started\",\"meta\":{\"platform\":\"whatsapp_desktop\"}}]"
}
EOF
)

RES=$(curl -sS -w "\n%{http_code}" -X POST "${API_BASE}/v1/crash-reports" \
  -H "Content-Type: application/json" \
  -H "X-Crash-Token: ${TOKEN}" \
  -d "$BODY") || fail "enriched crash POST failed"
CODE=$(echo "$RES" | tail -n1)

if [[ "$CODE" == "200" ]]; then
  ok "Enriched crash ingest OK on ${API_BASE}"
  exit 0
fi

if [[ "$CODE" == "422" ]]; then
  warn "Enriched fields rejected (HTTP 422) — migration 012 not deployed yet; run apply-migration-012.js"
  exit 0
fi

fail "Enriched crash ingest returned HTTP ${CODE}"
