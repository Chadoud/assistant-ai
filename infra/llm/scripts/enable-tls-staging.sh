#!/usr/bin/env bash
# Enable HTTPS (Caddy + Let's Encrypt) once DOMAIN resolves to this host.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing $ROOT/.env — copy .env.example and set DOMAIN, ACME_EMAIL, LITELLM_MASTER_KEY"
  exit 1
fi

# shellcheck disable=SC1091
source .env

: "${DOMAIN:?Set DOMAIN in .env (e.g. llm-staging.exosites.ch)}"
: "${ACME_EMAIL:?Set ACME_EMAIL in .env}"

echo "==> Checking DNS for $DOMAIN"
RESOLVED="$(dig +short A "$DOMAIN" 2>/dev/null | head -1 || true)"
LOCAL_IP="$(curl -sf --max-time 5 ifconfig.me 2>/dev/null || curl -sf --max-time 5 icanhazip.com 2>/dev/null || true)"

if [[ -z "$RESOLVED" ]]; then
  echo "FAIL: No A record for $DOMAIN. Add DNS A -> this server's public IPv4, then re-run."
  exit 1
fi

echo "DNS: $DOMAIN -> $RESOLVED (this host public IP: ${LOCAL_IP:-unknown})"

COMPOSE=(sudo docker compose
  -f compose/docker-compose.minimal-staging.yml
  -f compose/docker-compose.infomaniak.yml
  -f compose/docker-compose.tls-overlay.yml
  --env-file .env)

echo "==> Starting stack with Caddy TLS overlay"
"${COMPOSE[@]}" up -d

echo "==> Waiting for Caddy + LiteLLM"
for _ in $(seq 1 40); do
  if curl -sf "https://$DOMAIN/health/liveliness" >/dev/null 2>&1; then
    echo "OK: https://$DOMAIN/health/liveliness"
    echo "Update Exo OLLAMA_HOST to https://$DOMAIN and open firewall TCP 443."
    exit 0
  fi
  sleep 3
done

echo "WARN: HTTPS health check did not pass yet. Check: ${COMPOSE[*]} logs -f caddy"
exit 1
