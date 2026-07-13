#!/usr/bin/env bash
# Verify Node SSH has no datasuite orphan; Web FTP has datasuite deployed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

fail() { echo -e "${RED}$*${NC}" >&2; exit 1; }
ok() { echo -e "${GREEN}$*${NC}"; }

# Node SSH — must NOT contain datasuite
ENV_NODE="${ROOT}/cloud-node/.env.deploy"
if [[ -f "$ENV_NODE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_NODE"
  set +a
  if [[ -n "${SSH_USER:-}" && -n "${SSH_HOST:-}" ]]; then
    run_ssh() {
      if [[ -n "${SSH_PASSWORD:-}" ]] && command -v sshpass >/dev/null 2>&1; then
        sshpass -p "${SSH_PASSWORD}" ssh -o StrictHostKeyChecking=accept-new \
          "${SSH_USER}@${SSH_HOST}" "$@"
      else
        ssh -o StrictHostKeyChecking=accept-new "${SSH_USER}@${SSH_HOST}" "$@"
      fi
    }
    if run_ssh "test -d sites/datasuite.exosites.ch" 2>/dev/null; then
      fail "Node SSH still has sites/datasuite.exosites.ch — run: npm run cleanup:datasuite-node-orphan"
    fi
    ok "Node SSH clean (api.exosites.ch only)"
  fi
fi

# Web — health + login
BASE="${DATASUITE_URL:-https://datasuite.exosites.ch}"
HEALTH=$(curl -fsS "${BASE}/api/health.php" || fail "datasuite health unreachable")
echo "$HEALTH" | grep -q '"ok":true' || fail "health ok:false"
echo "$HEALTH" | grep -q '"db":true' || fail "health db:false"
CODE=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}/login.php")
[[ "$CODE" == "200" ]] || fail "login page HTTP ${CODE}"

ok "DataSuite deployed on Web hosting: ${BASE}"
