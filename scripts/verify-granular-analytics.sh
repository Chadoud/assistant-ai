#!/usr/bin/env bash
# Smoke-test granular sort telemetry ingest (job_completed + sort_blocked).
set -euo pipefail

API_BASE="${EXOSITES_CLOUD_URL:-https://api.exosites.ch}"
INSTANCE_ID="verify-granular-$(date +%s)"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

fail() { echo -e "${RED}$*${NC}" >&2; exit 1; }
ok() { echo -e "${GREEN}$*${NC}"; }

EVENT_BODY=$(cat <<EOF
{
  "instance_id": "${INSTANCE_ID}",
  "app_version": "verify",
  "platform": "script",
  "locale": "en",
  "events": [
    {
      "name": "job_completed",
      "props": {
        "source": "local",
        "file_count_bucket": "1-5",
        "uncertain_rate_bucket": "0%",
        "failed_sort_bucket": "0%",
        "failed_fetch_bucket": "0%",
        "outcome": "clean",
        "ocr_used": false,
        "duration_bucket": "under_30s",
        "tab": "queue"
      }
    },
    {
      "name": "sort_blocked",
      "props": { "reason": "no_output_folder" }
    },
    {
      "name": "job_cancelled",
      "props": { "tab": "queue", "follow_up": "user" }
    },
    {
      "name": "review_opened",
      "props": { "file_count_bucket": "1-5" }
    },
    {
      "name": "setup_milestone",
      "props": { "milestone": "output_folder_set" }
    },
    {
      "name": "assistant_turn_started",
      "props": { "channel": "text", "intent_bucket": "sort" }
    }
  ]
}
EOF
)

RES=$(curl -fsS -w "\n%{http_code}" -X POST "${API_BASE}/v1/telemetry/events" \
  -H "Content-Type: application/json" \
  -d "$EVENT_BODY") || fail "telemetry POST failed"
CODE=$(echo "$RES" | tail -n1)
[[ "$CODE" == "200" ]] || fail "telemetry returned $CODE"

ok "Granular sort telemetry ingest OK on ${API_BASE}"
