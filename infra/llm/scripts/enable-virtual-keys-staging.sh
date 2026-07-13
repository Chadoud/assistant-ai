#!/usr/bin/env bash
# Enable LiteLLM virtual keys on the staging VPS (Postgres + DATABASE_URL).
# Run ON the GPU/staging host (YOUR_LLM_VPS_IPV4) as a user with docker access.
#
#   cd ~/exo-llm   # or copy infra/llm from repo
#   ./scripts/enable-virtual-keys-staging.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(sudo docker compose
  -f compose/docker-compose.minimal-staging.yml
  -f compose/docker-compose.minimal-postgres.yml
  -f compose/docker-compose.infomaniak.yml
  --env-file .env)

if [[ ! -f .env ]]; then
  echo "Missing $ROOT/.env — copy .env.example and set LITELLM_MASTER_KEY + POSTGRES_PASSWORD"
  exit 1
fi

if ! grep -q '^POSTGRES_PASSWORD=' .env; then
  PG_PASS="$(openssl rand -hex 16)"
  echo "POSTGRES_PASSWORD=${PG_PASS}" >> .env
  echo "==> Added POSTGRES_PASSWORD to .env"
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${LITELLM_MASTER_KEY:?Set LITELLM_MASTER_KEY in .env}"
: "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}"

echo "==> Starting stack with Postgres (virtual keys)"
"${COMPOSE[@]}" up -d

echo "==> Waiting for LiteLLM health"
for _ in $(seq 1 40); do
  if curl -sf http://127.0.0.1:4000/health/liveliness >/dev/null; then
    break
  fi
  sleep 3
done

if ! curl -sf http://127.0.0.1:4000/health/liveliness >/dev/null; then
  echo "FAIL: LiteLLM not healthy — check: sudo docker logs litellm --tail 80"
  exit 1
fi

echo "==> Probing /key/generate"
GEN_HTTP="$(curl -sS -o /tmp/litellm-gen.json -w '%{http_code}' -X POST "http://127.0.0.1:4000/key/generate" \
  -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"key_alias\":\"ga-enable-smoke-$(date +%s)\",\"duration\":\"1d\",\"models\":[\"mistral\",\"nomic-embed-text\"],\"max_parallel_requests\":2}")"

if [[ "$GEN_HTTP" != "200" ]]; then
  echo "FAIL: /key/generate HTTP ${GEN_HTTP}"
  head -c 400 /tmp/litellm-gen.json 2>/dev/null || true
  echo ""
  exit 1
fi

if ! grep -q '"key"' /tmp/litellm-gen.json 2>/dev/null; then
  echo "FAIL: /key/generate response missing key field"
  head -c 400 /tmp/litellm-gen.json 2>/dev/null || true
  exit 1
fi

rm -f /tmp/litellm-gen.json
echo "OK: virtual keys enabled on staging host"
echo ""
echo "Next (from your Mac repo):"
echo "  1. ./scripts/ga-disable-master-delegation-infomaniak.sh"
echo "  2. ./scripts/verify-sort-ga-readiness.sh"
echo "  3. Infomaniak Manager → Node.js → api.exosites.ch → Restart"
