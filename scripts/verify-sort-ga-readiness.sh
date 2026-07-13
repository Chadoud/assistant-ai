#!/usr/bin/env bash
# GA readiness probe for cloud sort credentials (no secrets printed).
#
# Usage:
#   ./scripts/verify-sort-ga-readiness.sh
#   ./scripts/verify-sort-ga-readiness.sh --require-virtual-keys
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${CLOUD_API_BASE:-https://api.exosites.ch}"
LLM_BASE="${SORT_LLM_BASE_URL:-https://llm-staging.exosites.ch}"
REQUIRE_VIRTUAL=0
[[ "${1:-}" == "--require-virtual-keys" ]] && REQUIRE_VIRTUAL=1

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
fail=0

check() {
  if [[ "$2" == "1" ]]; then
    echo -e "${GREEN}✓${NC} $1"
  else
    echo -e "${RED}✗${NC} $1"
    fail=1
  fi
}

echo "GA sort readiness → ${BASE}"
echo ""

health="$(curl -fsS "${BASE}/health" 2>/dev/null || echo '{}')"
echo "$health" | grep -q '"sort_credentials":true' && check "Cloud API sort_credentials feature" 1 || check "Cloud API sort_credentials feature" 0

if echo "$health" | grep -q '"sort_credentials_mode":"virtual"'; then
  check "Cloud API sort_credentials_mode=virtual (GA)" 1
  DELEGATION_ON=0
elif echo "$health" | grep -q '"sort_credentials_mode":"delegation"'; then
  check "Cloud API sort_credentials_mode=virtual (GA)" 0
  echo -e "  ${YELLOW}→ Infomaniak Manager: set SORT_LLM_ALLOW_MASTER_DELEGATION=0 and Restart Node app${NC}"
  DELEGATION_ON=1
else
  echo -e "${YELLOW}○${NC} Cloud API sort_credentials_mode not reported (deploy latest cloud-node + restart)"
fi

llm_code="$(curl -sS -o /dev/null -w '%{http_code}' "${LLM_BASE}/health/liveliness" 2>/dev/null || echo 000)"
[[ "$llm_code" == "200" ]] && check "LiteLLM gateway ${LLM_BASE}" 1 || check "LiteLLM gateway ${LLM_BASE} (HTTP ${llm_code})" 0

prod_code="$(curl -sS -o /dev/null -w '%{http_code}' "https://llm.exosites.ch/health/liveliness" 2>/dev/null || echo 000)"
if [[ "$prod_code" == "200" ]]; then
  check "Production LLM llm.exosites.ch" 1
else
  echo -e "${YELLOW}○${NC} Production LLM llm.exosites.ch not live (expected pre-GA)"
fi

# LiteLLM key/generate (needs LITELLM_MASTER_KEY in env or cloud-node/.env)
MASTER="${LITELLM_MASTER_KEY:-}"
if [[ -z "$MASTER" && -f "${ROOT}/cloud-node/.env" ]]; then
  MASTER="$(grep '^LITELLM_MASTER_KEY=' "${ROOT}/cloud-node/.env" | cut -d= -f2- | tr -d '"' || true)"
fi
if [[ -n "$MASTER" ]]; then
  gen_alias="ga-readiness-$(date +%s)"
  gen_code="$(curl -sS -o /tmp/ga-gen.json -w '%{http_code}' -X POST "${LLM_BASE}/key/generate" \
    -H "Authorization: Bearer ${MASTER}" \
    -H "Content-Type: application/json" \
    -d "{\"key_alias\":\"${gen_alias}\",\"duration\":\"1h\",\"models\":[\"mistral\",\"nomic-embed-text\"],\"max_parallel_requests\":2}" 2>/dev/null || echo 000)"
  if [[ "$gen_code" == "200" ]] && grep -q '"key"' /tmp/ga-gen.json 2>/dev/null; then
    check "LiteLLM /key/generate (virtual keys)" 1
    VIRTUAL_KEYS_OK=1
  else
    check "LiteLLM /key/generate (HTTP ${gen_code} — need Postgres on VPS)" 0
    VIRTUAL_KEYS_OK=0
  fi
  rm -f /tmp/ga-gen.json
else
  echo -e "${YELLOW}○${NC} LiteLLM /key/generate skipped (set LITELLM_MASTER_KEY in env or cloud-node/.env to probe)"
  VIRTUAL_KEYS_OK=0
fi

# shellcheck source=scripts/lib/ga-fetch-verify-token.sh
source "${ROOT}/scripts/lib/ga-fetch-verify-token.sh" "$BASE" || true
access="${GA_ACCESS_TOKEN:-}"
if [[ -n "$access" && "${GA_AUTH_SOURCE:-}" == "login" ]]; then
  echo -e "${GREEN}✓${NC} Auth token via GA verify login (no register)"
elif [[ -n "$access" ]]; then
  echo -e "${GREEN}✓${NC} Auth token via register"
elif [[ "${GA_REGISTER_RATE_LIMITED:-0}" == "1" ]]; then
  echo -e "${YELLOW}○${NC} Auth token unavailable (register rate-limited — cp cloud-node/.env.verify.example → .env.verify && npm run ga:provision-verify)"
fi
CREDS_BASE="${SORT_CREDENTIALS_BASE:-${LLM_BASE}}"
if [[ -n "$access" ]]; then
  creds="$(curl -sS -X POST "${CREDS_BASE}/v1/sort/credentials" \
    -H "Authorization: Bearer ${access}" \
    -H 'Content-Type: application/json' \
    -d '{}' 2>/dev/null || echo '{}')"
  sort_tok="$(echo "$creds" | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)"
  managed="$(echo "$creds" | python3 -c "import json,sys; print(json.load(sys.stdin).get('credentials_managed', False))" 2>/dev/null || true)"
  [[ -n "$sort_tok" ]] && check "POST /v1/sort/credentials returns token" 1 || check "POST /v1/sort/credentials returns token" 0
  slots="$(echo "$creds" | python3 -c "import json,sys; print(json.load(sys.stdin).get('llm_max_slots',''))" 2>/dev/null || true)"
  conc="$(echo "$creds" | python3 -c "import json,sys; print(json.load(sys.stdin).get('sort_max_concurrency',''))" 2>/dev/null || true)"
  queue_url="$(echo "$creds" | python3 -c "import json,sys; print(json.load(sys.stdin).get('queue_url') or '')" 2>/dev/null || true)"
  [[ -n "$slots" ]] && check "Credentials include llm_max_slots=${slots}" 1 || check "Credentials include llm_max_slots" 0
  [[ -n "$conc" ]] && check "Credentials include sort_max_concurrency=${conc}" 1 || check "Credentials include sort_max_concurrency" 0
  if [[ -n "$queue_url" ]]; then
    check "Credentials include queue_url (queue under load or always mode)" 1
    queue_code="$(curl -sS -o /tmp/sq-health.json -w '%{http_code}' "${queue_url%/}/v1/sort/queue/health" 2>/dev/null || echo 000)"
    [[ "$queue_code" == "200" ]] && check "Sort queue /health (${queue_url})" 1 || check "Sort queue /health (HTTP ${queue_code})" 0
  else
    queue_code="$(curl -sS -o /tmp/sq-health.json -w '%{http_code}' "${LLM_BASE%/}/v1/sort/queue/health" 2>/dev/null || echo 000)"
    if [[ "$queue_code" == "200" ]]; then
      echo -e "${GREEN}✓${NC} Sort queue live; credentials omit queue_url (idle / auto admission)"
    else
      echo -e "${YELLOW}○${NC} Sort queue not enabled or not reachable (SORT_LLM_QUEUE_ENABLED=0)"
    fi
  fi
  if [[ -n "$MASTER" && -n "$sort_tok" && "$sort_tok" == "$MASTER" ]]; then
    check "Credentials use per-user virtual key (not master)" 0
    echo -e "  ${YELLOW}→ master delegation is ON (SORT_LLM_ALLOW_MASTER_DELEGATION=1)${NC}"
    DELEGATION_ON=1
  elif [[ -n "$sort_tok" ]]; then
    check "Credentials use per-user virtual key (not master)" 1
    DELEGATION_ON=0
  fi
else
  check "POST /v1/sort/credentials (no auth token)" 0
fi

overrides="${HOME}/Library/Application Support/EXO/backend-env-overrides.json"
if [[ -f "$overrides" ]]; then
  python3 -c "
import json, os, sys
p=os.path.expanduser('~/Library/Application Support/EXO/backend-env-overrides.json')
d=json.load(open(p))
ok = d.get('EXOSITES_SORT_CREDENTIALS_MANAGED') in ('1', 1) and d.get('OLLAMA_MODE')=='remote'
sys.exit(0 if ok else 1)
" && check "Desktop managed sort credentials (overrides)" 1 || check "Desktop managed sort credentials (overrides)" 0
else
  echo -e "${YELLOW}○${NC} Desktop overrides file not found (skip)"
fi

echo ""
if [[ "$fail" -eq 0 ]]; then
  echo -e "${GREEN}GA readiness checks passed.${NC}"
  exit 0
fi

if [[ "$REQUIRE_VIRTUAL" -eq 1 && "${VIRTUAL_KEYS_OK:-0}" -ne 1 ]]; then
  exit 1
fi

echo -e "${RED}Some GA checks failed — see docs/SAAS_SORT_UX_PLAN.md Section A${NC}"
exit 1
