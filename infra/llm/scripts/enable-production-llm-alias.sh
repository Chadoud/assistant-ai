#!/usr/bin/env bash
# Add TLS for llm.exosites.ch on the existing staging VPS stack (shared LiteLLM).
#
# Prerequisite: DNS A record llm.exosites.ch → same IPv4 as llm-staging.exosites.ch
#
# Usage (on VPS):
#   cd ~/exo-llm && ./scripts/enable-production-llm-alias.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

# shellcheck source=scripts/lib/compose-stack.sh
source "${ROOT}/scripts/lib/compose-stack.sh"
mapfile -t COMPOSE_FILES < <(compose_llm_stack)
COMPOSE=(docker compose "${COMPOSE_FILES[@]}" --env-file .env)

if ! grep -q 'llm.exosites.ch' caddy/Caddyfile; then
  sed -i.bak 's/{\$DOMAIN} {/{\$DOMAIN}, llm.exosites.ch {/' caddy/Caddyfile
fi

echo "==> Reloading Caddy with production alias llm.exosites.ch…"
"${COMPOSE[@]}" up -d caddy sort-credentials-broker
if [[ "${SORT_LLM_QUEUE_ENABLED:-0}" == "1" ]]; then
  "${COMPOSE[@]}" up -d redis sort-queue
fi
"${COMPOSE[@]}" restart caddy

for host in "${DOMAIN}" llm.exosites.ch; do
  echo -n "==> https://${host}/health/liveliness → "
  curl -fsS "https://${host}/health/liveliness" | head -c 40
  echo ""
  if [[ "${SORT_LLM_QUEUE_ENABLED:-0}" == "1" ]]; then
    echo -n "==> https://${host}/v1/sort/queue/health → "
    curl -fsS "https://${host}/v1/sort/queue/health" | head -c 80
    echo ""
  fi
done

echo "Done. Production alias live at https://llm.exosites.ch"
