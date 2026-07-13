#!/usr/bin/env bash
# One-time host prep for GPU LLM node.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Checking Docker..."
command -v docker >/dev/null || { echo "Install Docker first"; exit 1; }

echo "==> Checking NVIDIA runtime (optional for CPU-only embed)..."
if docker info 2>/dev/null | grep -q nvidia; then
  echo "NVIDIA runtime OK"
else
  echo "WARN: NVIDIA runtime not detected — ollama-chat GPU reservation may fail"
fi

MODEL_DIR="/mnt/nvme/ollama"
if [[ ! -d "$MODEL_DIR" ]]; then
  echo "==> Creating $MODEL_DIR"
  sudo mkdir -p "$MODEL_DIR"
  sudo chown "$(whoami):$(whoami)" "$MODEL_DIR" 2>/dev/null || true
fi

if [[ ! -f "$ROOT/.env" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "Created $ROOT/.env — edit secrets before deploy"
fi

echo "==> Done. Next: docker compose -f compose/docker-compose.yml --env-file .env up -d"
