#!/usr/bin/env bash
# Enable sort-worker overlay on VPS (OCR + analyze on server).
#
# Flat VPS (~/exo-llm): rsync infra/llm + backend/ first, then:
#   cd ~/exo-llm && ./scripts/enable-sort-worker-staging.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and set LITELLM_MASTER_KEY, DOMAIN, ACME_EMAIL"
  exit 1
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
  --env-file .env)

if [[ "${SORT_LLM_QUEUE_ENABLED:-0}" == "1" ]]; then
  COMPOSE+=(
    -f compose/docker-compose.redis-overlay.yml
    -f compose/docker-compose.queue-overlay.yml
  )
fi

if [[ -d "$ROOT/backend" ]]; then
  echo "==> Detected flat exo-llm layout (backend/ present)"
  COMPOSE+=(-f compose/docker-compose.sort-worker-vps-flat.yml)
elif [[ -d "$ROOT/../../../backend" ]]; then
  echo "==> Detected monorepo layout"
  COMPOSE+=(-f compose/docker-compose.sort-worker-overlay.yml)
else
  echo "FAIL: backend/ not found."
  echo "  Flat VPS: rsync backend/ to $ROOT/backend/"
  echo "  Monorepo: run from ai-file-sorter/infra/llm"
  exit 1
fi

echo "==> Building and starting sort-worker..."
"${COMPOSE[@]}" up -d --build sort-worker

echo "==> Reloading Caddy (/v1/sort/worker route)..."
"${COMPOSE[@]}" up -d caddy
"${COMPOSE[@]}" restart caddy

echo "==> Health check (container localhost)..."
sleep 5
docker exec sort-worker curl -sf http://127.0.0.1:8020/health

if [[ -n "${DOMAIN:-}" ]]; then
  echo "==> Public health https://${DOMAIN}/v1/sort/worker/health ..."
  curl -sfS "https://${DOMAIN}/v1/sort/worker/health" | head -c 200
  echo ""
fi

if ! grep -q '^SORT_SERVICE_MODE=' .env 2>/dev/null; then
  echo ""
  echo "NOTE: SORT_SERVICE_MODE not in .env — broker defaults to cloud (LLM-only)."
  echo "      After smoke test, set SORT_SERVICE_MODE=cloud_full and restart sort-credentials-broker."
fi

echo ""
echo "Done. analyze-file: https://${DOMAIN:-\$DOMAIN}/v1/sort/worker/analyze-file"
echo "Smoke from laptop: SORT_WORKER_URL=https://${DOMAIN}/v1/sort/worker OLLAMA_API_KEY=... bash scripts/smoke-sort-worker-staging.sh"
