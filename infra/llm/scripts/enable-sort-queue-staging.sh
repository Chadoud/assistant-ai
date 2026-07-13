#!/usr/bin/env bash
# Enable Redis fair queue + update broker credentials on the LLM VPS.
#
# Usage (on VPS after rsync):
#   cd ~/exo-llm && ./scripts/enable-sort-queue-staging.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and set LITELLM_MASTER_KEY, DOMAIN, ACME_EMAIL"
  exit 1
fi

if ! grep -q '^SORT_LLM_QUEUE_ENABLED=' .env; then
  echo "SORT_LLM_QUEUE_ENABLED=1" >> .env
else
  sed -i.bak 's/^SORT_LLM_QUEUE_ENABLED=.*/SORT_LLM_QUEUE_ENABLED=1/' .env
fi

if ! grep -q '^SORT_LLM_QUEUE_IN_CREDENTIALS=' .env; then
  echo "SORT_LLM_QUEUE_IN_CREDENTIALS=auto" >> .env
else
  sed -i.bak 's/^SORT_LLM_QUEUE_IN_CREDENTIALS=.*/SORT_LLM_QUEUE_IN_CREDENTIALS=auto/' .env
fi

if ! grep -q '^SORT_QUEUE_ADMIT_THRESHOLD=' .env; then
  echo "SORT_QUEUE_ADMIT_THRESHOLD=2" >> .env
fi

if ! grep -q '^SORT_LLM_QUEUE_IN_CREDENTIALS=' .env; then
  echo "SORT_LLM_QUEUE_IN_CREDENTIALS=auto" >> .env
else
  sed -i.bak 's/^SORT_LLM_QUEUE_IN_CREDENTIALS=.*/SORT_LLM_QUEUE_IN_CREDENTIALS=auto/' .env
fi

if ! grep -q '^SORT_QUEUE_ADMIT_THRESHOLD=' .env; then
  echo "SORT_QUEUE_ADMIT_THRESHOLD=2" >> .env
fi

if ! grep -q '^SORT_LLM_QUEUE_IN_CREDENTIALS=' .env; then
  echo "SORT_LLM_QUEUE_IN_CREDENTIALS=auto" >> .env
else
  sed -i.bak 's/^SORT_LLM_QUEUE_IN_CREDENTIALS=.*/SORT_LLM_QUEUE_IN_CREDENTIALS=auto/' .env
fi

if ! grep -q '^SORT_QUEUE_ADMIT_THRESHOLD=' .env; then
  echo "SORT_QUEUE_ADMIT_THRESHOLD=2" >> .env
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

COMPOSE=(docker compose
  -f compose/docker-compose.minimal-staging.yml
  -f compose/docker-compose.infomaniak.yml
  -f compose/docker-compose.minimal-postgres.yml
  -f compose/docker-compose.tls-overlay.yml
  -f compose/docker-compose.sort-credentials-broker.yml
  -f compose/docker-compose.redis-overlay.yml
  -f compose/docker-compose.queue-overlay.yml
  --env-file .env)

echo "==> Starting Redis + sort-queue workers…"
sed -i 's/\r$//' scripts/lib/*.sh 2>/dev/null || true
"${COMPOSE[@]}" up -d --build redis sort-queue

echo "==> Restarting broker (queue_url in credentials) + Caddy routes…"
"${COMPOSE[@]}" up -d --build sort-credentials-broker caddy
"${COMPOSE[@]}" restart caddy sort-credentials-broker

echo "==> Queue health (public)…"
curl -fsS "https://${DOMAIN}/v1/sort/queue/health" | head -c 200
echo ""

echo "==> LiteLLM health…"
curl -fsS "https://${DOMAIN}/health/liveliness" | head -c 80
echo ""

echo "Done. Queue runs on VPS; credentials use queue_url only when load warrants it (SORT_LLM_QUEUE_IN_CREDENTIALS=auto)."
