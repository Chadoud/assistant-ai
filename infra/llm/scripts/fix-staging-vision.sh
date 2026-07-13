#!/usr/bin/env bash
# Rebuild LiteLLM with Pillow, pull moondream on Ollama, restart sort stack.
#
# Run on VPS after rsync:
#   cd ~/exo-llm && ./scripts/fix-staging-vision.sh
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

echo "==> Rebuilding LiteLLM (Pillow for moondream vision)..."
"${COMPOSE[@]}" up -d --build litellm

echo "==> Waiting for LiteLLM health..."
for _ in $(seq 1 30); do
  if docker exec litellm python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4000/health/liveliness')" >/dev/null 2>&1; then
    break
  fi
  sleep 3
done
docker exec litellm python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4000/health/liveliness')"

echo "==> Pulling vision model on Ollama..."
"$ROOT/scripts/pull-models.sh"

echo "==> Rebuilding sort-worker (if backend/ present)..."
if [[ -d "$ROOT/backend" ]]; then
  COMPOSE+=(-f compose/docker-compose.sort-worker-vps-flat.yml)
  "${COMPOSE[@]}" up -d --build sort-worker
  sleep 5
  docker exec sort-worker curl -sf http://127.0.0.1:8020/health
fi

echo "==> Gateway vision smoke (container localhost)..."
LLM_BASE_URL="http://127.0.0.1:4000" EXO_BACKEND_STAGING_KEY="${LITELLM_MASTER_KEY}" SKIP_VISION=0 "$ROOT/scripts/smoke-test.sh" || {
  echo "Localhost smoke skipped (port 4000 not published); trying public URL..."
  LLM_BASE_URL="https://${DOMAIN}" EXO_BACKEND_STAGING_KEY="${LITELLM_MASTER_KEY}" SKIP_VISION=0 "$ROOT/scripts/smoke-test.sh"
}

echo ""
echo "Done. From laptop:"
echo "  npm run ga:staging-vision"
