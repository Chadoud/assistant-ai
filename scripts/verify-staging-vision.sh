#!/usr/bin/env bash
# Staging vision readiness: LiteLLM moondream + sort-worker hybrid extract.
#
# Usage:
#   npm run ga:staging-vision
#   SKIP_WORKER=1 npm run ga:staging-vision   # gateway only
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LLM_BASE="${SORT_LLM_BASE_URL:-https://llm-staging.exosites.ch}"
API_BASE="${CLOUD_API_BASE:-https://api.exosites.ch}"

tok=""
if [[ -f "${ROOT}/cloud-node/.env" ]]; then
  tok="$(grep '^LITELLM_MASTER_KEY=' "${ROOT}/cloud-node/.env" | cut -d= -f2- | tr -d '"' || true)"
fi

if [[ -z "$tok" ]]; then
  # shellcheck source=scripts/lib/ga-fetch-verify-token.sh
  source "${ROOT}/scripts/lib/ga-fetch-verify-token.sh" "$API_BASE" || true
  access="${GA_ACCESS_TOKEN:-}"
  if [[ -n "$access" ]]; then
    creds="$(curl -sS -X POST "${LLM_BASE}/v1/sort/credentials" \
      -H "Authorization: Bearer ${access}" \
      -H 'Content-Type: application/json' \
      -d '{}' 2>/dev/null || echo '{}')"
    tok="$(echo "$creds" | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)"
  fi
fi

[[ -n "$tok" ]] || { echo "No LiteLLM token — set cloud-node/.env LITELLM_MASTER_KEY or GA verify login" >&2; exit 1; }

export EXO_BACKEND_STAGING_KEY="$tok"
export LLM_BASE_URL="$LLM_BASE"

echo "==> LiteLLM gateway vision smoke ($LLM_BASE)"
bash "${ROOT}/infra/llm/scripts/smoke-test.sh"

if [[ "${SKIP_WORKER:-0}" == "1" ]]; then
  echo "SKIP_WORKER=1 — skipping sort-worker image smoke"
  exit 0
fi

export SORT_WORKER_URL="${SORT_WORKER_URL:-${EXOSITES_CLOUD_SORT_WORKER_URL:-${LLM_BASE}/v1/sort/worker}}"
export OLLAMA_API_KEY="$tok"

echo "==> Sort-worker image smoke ($SORT_WORKER_URL)"
bash "${ROOT}/scripts/smoke-sort-worker-staging.sh"

echo "==> Staging vision checks passed"
