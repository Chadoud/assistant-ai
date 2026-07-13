#!/usr/bin/env bash
# Closed-beta smoke: API automation + desktop checklist echo.
#
# Usage: ./scripts/ga-closed-beta-smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== Automated (API) ==="
"${ROOT}/scripts/verify-sort-ga-readiness.sh"
set +e
"${ROOT}/scripts/verify-cloud-auth-api.sh" | tail -5
auth_exit=$?
set -e
if [[ $auth_exit -ne 0 ]]; then
  echo -e "${YELLOW}Cloud auth verify had failures (often rate-limit) — see above${NC}"
fi
SKIP_FULL_EVAL=1 bash "${ROOT}/scripts/ga-staging-classify-smoke.sh" | tail -5
bash "${ROOT}/scripts/ga-copy-audit.sh" | tail -4

echo ""
echo "=== Desktop overrides (macOS) ==="
OVERRIDES="${HOME}/Library/Application Support/EXO/backend-env-overrides.json"
if [[ -f "$OVERRIDES" ]]; then
  python3 -c "
import json, os, sys
p = os.path.expanduser('~/Library/Application Support/EXO/backend-env-overrides.json')
d = json.load(open(p))
ok = (
    d.get('EXOSITES_SORT_CREDENTIALS_MANAGED') in ('1', 1)
    and d.get('OLLAMA_MODE') == 'remote'
    and str(d.get('OLLAMA_HOST', '')).startswith('https://')
)
print('managed:', d.get('EXOSITES_SORT_CREDENTIALS_MANAGED'))
print('mode:', d.get('OLLAMA_MODE'))
print('host:', d.get('OLLAMA_HOST'))
sys.exit(0 if ok else 1)
" && echo -e "${GREEN}Desktop overrides OK${NC}" || echo -e "${YELLOW}Overrides need sign-in / credential sync${NC}"
else
  echo -e "${YELLOW}No overrides file — sign in to Exo first${NC}"
fi

if curl -fsS "http://127.0.0.1:7799/health" >/dev/null 2>&1; then
  bash "${ROOT}/scripts/ga-desktop-smoke.sh" || true
else
  echo -e "${YELLOW}Backend not running — skip ga:desktop-smoke (start npm run dev)${NC}"
fi

echo ""
echo -e "${YELLOW}=== Manual (5 min) ===${NC}"
echo "  1. Restart Exo (quit + npm run dev or relaunch app)"
echo "  2. Sign in → Sort 10+ mixed files (PDF, image, text)"
echo "  3. Settings → AI models → Vision → Refresh models → llava or moondream visible"
echo "  4. No API key field under File sorting when signed in"
