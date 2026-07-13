#!/usr/bin/env bash
# Smoke-test staging LiteLLM classify path (virtual key + mistral).
#
# Usage: ./scripts/ga-staging-classify-smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LLM_BASE="${SORT_LLM_BASE_URL:-https://llm-staging.exosites.ch}"
API_BASE="${CLOUD_API_BASE:-https://api.exosites.ch}"

# shellcheck source=scripts/lib/ga-fetch-verify-token.sh
source "${ROOT}/scripts/lib/ga-fetch-verify-token.sh" "$API_BASE" || true
access="${GA_ACCESS_TOKEN:-}"

tok=""
if [[ -n "$access" ]]; then
  creds="$(curl -sS -X POST "${LLM_BASE}/v1/sort/credentials" \
    -H "Authorization: Bearer ${access}" \
    -H 'Content-Type: application/json' \
    -d '{}' 2>/dev/null || echo '{}')"
  tok="$(echo "$creds" | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)"
fi

if [[ -z "$tok" && -f "${ROOT}/cloud-node/.env" ]]; then
  tok="$(grep '^LITELLM_MASTER_KEY=' "${ROOT}/cloud-node/.env" | cut -d= -f2- | tr -d '"' || true)"
  [[ -n "$tok" ]] && echo "==> Using local LITELLM_MASTER_KEY (register rate-limited or creds failed)"
fi

[[ -n "$tok" ]] || { echo "No sort LLM token — wait and retry or set cloud-node/.env"; exit 1; }

echo "==> Live classify on one fixture via staging mistral"
cd "${ROOT}/backend"
OLLAMA_MODE=remote \
OLLAMA_HOST="${LLM_BASE}" \
OLLAMA_API_KEY="${tok}" \
EXOSITES_REMOTE_LLM=1 \
python3 -c "
import json
from classifier import classify_candidates
case = json.loads(open('classify_eval/fixtures/invoice_clear.json').read())
r = classify_candidates(
    case['text'],
    case.get('existing_folders') or [],
    case.get('folder_contexts') or {},
    model='mistral',
    language='English',
    filename_tokens=case.get('filename_tokens') or [],
)
folder = r.get('folder_name') or r.get('folder')
print('folder:', folder)
print('confidence:', r.get('confidence'))
if not folder:
    raise SystemExit('no folder returned')
print('OK: staging classify smoke passed')
"

if [[ "${SKIP_FULL_EVAL:-0}" == "1" ]]; then
  echo "SKIP_FULL_EVAL=1 — skipping full fixture eval"
  exit 0
fi

echo "==> Full fixture eval (may take 1–3 min)…"
OLLAMA_MODE=remote OLLAMA_HOST="${LLM_BASE}" OLLAMA_API_KEY="${tok}" EXOSITES_REMOTE_LLM=1 \
  python3 -m classify_eval.run_eval --model mistral --json-out /tmp/ga-staging-eval.json

python3 -c "
import json
r=json.load(open('/tmp/ga-staging-eval.json'))
print('cases:', r.get('cases_run'))
print('uncertain_rate:', r.get('metrics',{}).get('uncertain_rate'))
"
echo "Done."
