#!/usr/bin/env bash
# Deploy sort-credentials-broker on the LLM VPS (colocated with LiteLLM).
#
# Usage (on VPS after rsync):
#   cd ~/exo-llm && ./scripts/enable-sort-credentials-broker.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

echo "==> Building and starting sort-credentials-broker + Caddy route…"
"${COMPOSE[@]}" up -d --build sort-credentials-broker caddy

echo "==> Reloading Caddy (pick up /v1/sort/credentials route)…"
"${COMPOSE[@]}" restart caddy

echo "==> Broker health (inside docker network)…"
docker exec sort-credentials-broker wget -qO- http://127.0.0.1:4010/health || true

echo "==> Public health (LiteLLM)…"
curl -fsS "https://${DOMAIN}/health/liveliness" | head -c 80
echo ""

echo "Done. Desktop mints credentials at: https://${DOMAIN}/v1/sort/credentials"
