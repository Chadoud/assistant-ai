#!/usr/bin/env bash
# Pull models from models/models.yaml into the running Ollama container.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHAT_TAG="${CHAT_MODEL:-mistral:latest}"
EMBED_TAG="${EMBED_MODEL:-nomic-embed-text:latest}"
VISION_TAG="${VISION_MODEL:-moondream:latest}"

OLLAMA_CONTAINER="${OLLAMA_CONTAINER:-}"
if [ -z "$OLLAMA_CONTAINER" ]; then
  if docker ps --format '{{.Names}}' | grep -qx ollama; then
    OLLAMA_CONTAINER=ollama
  elif docker ps --format '{{.Names}}' | grep -qx ollama-chat; then
    OLLAMA_CONTAINER=ollama-chat
  else
    echo "No ollama container running"
    exit 1
  fi
fi

echo "==> Using container: $OLLAMA_CONTAINER"
echo "==> Pulling chat model: $CHAT_TAG"
docker exec "$OLLAMA_CONTAINER" ollama pull "$CHAT_TAG"

echo "==> Pulling embed model: $EMBED_TAG"
docker exec "$OLLAMA_CONTAINER" ollama pull "$EMBED_TAG"

echo "==> Pulling vision model: $VISION_TAG"
docker exec "$OLLAMA_CONTAINER" ollama pull "$VISION_TAG"

echo "==> Loaded models:"
docker exec "$OLLAMA_CONTAINER" ollama list

echo "==> Warmup"
OLLAMA_CONTAINER="$OLLAMA_CONTAINER" "$ROOT/scripts/warmup.sh"

echo "==> Warmup vision (moondream)"
docker exec "$OLLAMA_CONTAINER" ollama run moondream "describe" --verbose false 2>/dev/null || true
