#!/usr/bin/env bash
# Shared docker compose stack for staging/production LLM host (5-user GA target).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

compose_llm_stack() {
  local -a files=(
    -f compose/docker-compose.minimal-staging.yml
    -f compose/docker-compose.infomaniak.yml
    -f compose/docker-compose.minimal-postgres.yml
    -f compose/docker-compose.tls-overlay.yml
    -f compose/docker-compose.sort-credentials-broker.yml
  )
  if [[ -f "${ROOT}/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${ROOT}/.env"
    set +a
  fi
  if [[ "${SORT_LLM_QUEUE_ENABLED:-0}" == "1" ]]; then
    files+=(
      -f compose/docker-compose.redis-overlay.yml
      -f compose/docker-compose.queue-overlay.yml
    )
  fi
  if [[ "${SORT_PROMETHEUS_ENABLED:-0}" == "1" ]]; then
    files+=(-f compose/docker-compose.prometheus-overlay.yml)
  fi
  if [[ "${SORT_ALERTMANAGER_ENABLED:-0}" == "1" ]]; then
    files+=(-f compose/docker-compose.alertmanager-overlay.yml)
  fi
  printf '%s\n' "${files[@]}"
}
