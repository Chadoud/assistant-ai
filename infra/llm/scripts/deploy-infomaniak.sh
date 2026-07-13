#!/usr/bin/env bash
# One-shot deploy on Infomaniak Cloud Server (18GB RAM, 250GB at /mnt/data).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f compose/docker-compose.minimal-staging.yml -f compose/docker-compose.minimal-postgres.yml -f compose/docker-compose.infomaniak.yml)

if [ ! -f .env ]; then
  cp .env.example .env
  MASTER=$(openssl rand -hex 24)
  POSTGRES=$(openssl rand -hex 16)
  cat > .env <<EOF
DOMAIN=llm-staging.exosites.ch
ACME_EMAIL=ops@exosites.ch
LITELLM_MASTER_KEY=sk-exo-${MASTER}
POSTGRES_PASSWORD=${POSTGRES}
EXO_BACKEND_STAGING_KEY=sk-exo-staging-${MASTER}
OLLAMA_NUM_PARALLEL=2
OLLAMA_MAX_QUEUE=32
OLLAMA_KEEP_ALIVE=30m
LLM_BASE_URL=http://127.0.0.1:4000
EOF
  chmod 600 .env
  echo "Created .env — save LITELLM_MASTER_KEY before closing this shell."
fi

./scripts/install-host-infomaniak.sh
./scripts/migrate-containerd-to-data.sh

sudo "${COMPOSE[@]}" --env-file .env up -d
./scripts/pull-models.sh
./scripts/smoke-test.sh

echo "==> External URL: http://$(curl -sf ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'):4000"
