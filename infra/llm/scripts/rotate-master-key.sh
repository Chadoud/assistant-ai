#!/usr/bin/env bash
# Rotate LiteLLM master key on the staging host and restart the stack.
# After running: update Exo desktop Settings → Sort LLM location → API key.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing $ROOT/.env"
  exit 1
fi

NEW_KEY="sk-exo-$(openssl rand -hex 24)"
echo "==> New master key prefix: ${NEW_KEY:0:12}..."

if grep -q '^LITELLM_MASTER_KEY=' .env; then
  sed -i.bak "s|^LITELLM_MASTER_KEY=.*|LITELLM_MASTER_KEY=${NEW_KEY}|" .env
else
  echo "LITELLM_MASTER_KEY=${NEW_KEY}" >> .env
fi

COMPOSE=(sudo docker compose
  -f compose/docker-compose.minimal-staging.yml
  -f compose/docker-compose.infomaniak.yml
  -f compose/docker-compose.minimal-postgres.yml
  -f compose/docker-compose.tls-overlay.yml
  -f compose/docker-compose.sort-credentials-broker.yml
  --env-file .env)

echo "==> Restarting LiteLLM + broker with new key"
"${COMPOSE[@]}" up -d litellm sort-credentials-broker
"${COMPOSE[@]}" restart caddy

for _ in $(seq 1 20); do
  if curl -sf http://127.0.0.1:4000/health/liveliness >/dev/null; then
    echo "OK: LiteLLM healthy"
    echo "Sync key to Infomaniak + Mac: ./scripts/ga-rotate-lite-llm-master.sh (from repo) or paste into VPS/Infomaniak .env"
    echo "Desktop uses VPS broker — no manual API key in Settings."
    exit 0
  fi
  sleep 2
done

echo "WARN: health check did not pass — check logs"
exit 1
