#!/usr/bin/env bash
# Probe local Exo backend for closed-beta desktop readiness (backend must be running).
#
# Usage:
#   npm run dev   # in another terminal
#   ./scripts/ga-desktop-smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${EXO_BACKEND_URL:-http://127.0.0.1:7799}"
OVERRIDES="${HOME}/Library/Application Support/EXO/backend-env-overrides.json"
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

echo "Desktop smoke → ${BASE}"
echo ""

health="$(curl -fsS "${BASE}/health" 2>/dev/null || echo '{}')"
if echo "$health" | grep -q '"ok"'; then
  check "GET /health" 1
else
  check "GET /health (start npm run dev)" 0
  exit 1
fi

if [[ ! -f "$OVERRIDES" ]]; then
  check "backend-env-overrides.json (sign in to Exo)" 0
  exit 1
fi

read -r mode host managed <<< "$(python3 -c "
import json, os
p=os.path.expanduser('~/Library/Application Support/EXO/backend-env-overrides.json')
d=json.load(open(p))
print(d.get('OLLAMA_MODE',''), d.get('OLLAMA_HOST',''), d.get('EXOSITES_SORT_CREDENTIALS_MANAGED',''))
")"

[[ "$mode" == "remote" ]] && check "OLLAMA_MODE=remote" 1 || check "OLLAMA_MODE=remote (got ${mode:-?})" 0
[[ "$host" == https://* ]] && check "OLLAMA_HOST is cloud gateway (${host})" 1 || check "OLLAMA_HOST is cloud gateway" 0
[[ "$managed" == "1" || "$managed" == 1 ]] \
  && check "Managed sort credentials" 1 \
  || check "Managed sort credentials (sign in)" 0
check "backend-env-overrides.json" 1

# Refresh sort LLM key when overrides token is stale (common after master rotation).
FRESH_KEY=""
# shellcheck source=scripts/lib/ga-fetch-verify-token.sh
source "${ROOT}/scripts/lib/ga-fetch-verify-token.sh" "https://api.exosites.ch" 2>/dev/null || true
if [[ -n "${GA_ACCESS_TOKEN:-}" ]]; then
  CREDS_BASE="${SORT_CREDENTIALS_BASE:-https://llm-staging.exosites.ch}"
  creds_raw="$(curl -fsS -X POST "${CREDS_BASE}/v1/sort/credentials" \
    -H "Authorization: Bearer ${GA_ACCESS_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d '{}' 2>/dev/null || echo '{}')"
  FRESH_KEY="$(echo "$creds_raw" | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)"
  [[ -n "$FRESH_KEY" ]] && check "Fresh sort credentials from broker" 1 || check "Fresh sort credentials from broker" 0
fi

model_report="$(cd "${ROOT}/backend" && _GA_FRESH_SORT_KEY="${FRESH_KEY}" python3 -c "
import json, os, sys
from pathlib import Path

overrides = Path.home() / 'Library/Application Support/EXO/backend-env-overrides.json'
if overrides.exists():
    for k, v in json.loads(overrides.read_text()).items():
        os.environ[str(k)] = str(v)

fresh = os.environ.pop('_GA_FRESH_SORT_KEY', None)
if fresh:
    os.environ['OLLAMA_API_KEY'] = fresh

from classifier import list_models
names = list_models()
vision = [n for n in names if any(v in n.lower() for v in ('llava', 'moondream', 'bakllava'))]
remote = [n for n in names if 'mistral' in n.lower() or 'nomic-embed' in n.lower()]
print('vision', ','.join(vision) or 'none')
print('remote', ','.join(remote) or 'none')
print('ok_vision', 1 if vision else 0)
print('ok_remote', 1 if any('mistral' in n.lower() for n in names) else 0)
" 2>/dev/null || echo 'ok_remote 0')"

ok_remote="$(echo "$model_report" | awk '/^ok_remote/{print $2}')"
ok_vision="$(echo "$model_report" | awk '/^ok_vision/{print $2}')"
vision_list="$(echo "$model_report" | awk '/^vision/{print $2}')"
remote_list="$(echo "$model_report" | awk '/^remote/{print $2}')"

[[ "$ok_remote" == "1" ]] && check "Remote sort models include mistral (${remote_list})" 1 \
  || check "Remote sort models include mistral" 0
[[ "$ok_vision" == "1" ]] && check "Local vision model visible (${vision_list})" 1 \
  || check "Local vision model visible — install llava or moondream, then Refresh models" 0

echo ""
if [[ "$fail" -eq 0 ]]; then
  echo -e "${GREEN}Desktop smoke passed.${NC} Next: sort 10+ mixed files in the UI."
  exit 0
fi
echo -e "${YELLOW}Fix items above, then sort 10+ mixed files in the UI.${NC}"
exit 1
