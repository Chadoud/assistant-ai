#!/usr/bin/env bash
# Enable Prometheus scrape for LiteLLM + sort-queue on the LLM VPS.
#
# Usage (on VPS):
#   cd ~/exo-llm && ./scripts/enable-prometheus-staging.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env"
  exit 1
fi

if ! grep -q '^SORT_PROMETHEUS_ENABLED=' .env; then
  echo "SORT_PROMETHEUS_ENABLED=1" >> .env
else
  sed -i.bak 's/^SORT_PROMETHEUS_ENABLED=.*/SORT_PROMETHEUS_ENABLED=1/' .env
fi

sed -i 's/\r$//' scripts/*.sh scripts/lib/*.sh 2>/dev/null || true

set -a
# shellcheck disable=SC1091
source .env
set +a

# shellcheck source=scripts/lib/compose-stack.sh
source "${ROOT}/scripts/lib/compose-stack.sh"
mapfile -t COMPOSE_FILES < <(compose_llm_stack)
COMPOSE=(docker compose "${COMPOSE_FILES[@]}" --env-file .env)

echo "==> Starting Prometheus (localhost:9090 on VPS)…"
"${COMPOSE[@]}" up -d prometheus

echo "==> Scrape targets (from VPS)…"
sleep 3
curl -fsS "http://127.0.0.1:9090/api/v1/targets" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for t in data.get('data', {}).get('activeTargets', []):
    print(t.get('labels', {}).get('job'), t.get('health'), t.get('scrapeUrl'))
" || echo "(prometheus starting — retry: curl http://127.0.0.1:9090/-/healthy)"

echo "Done. Prometheus enabled (SORT_PROMETHEUS_ENABLED=1). Alerts in prometheus/alerts.yml"
