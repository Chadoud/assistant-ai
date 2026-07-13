#!/usr/bin/env bash
# Minimal warmup — keeps hot models loaded.
set -euo pipefail

CONTAINER="${OLLAMA_CONTAINER:-ollama}"
docker exec "$CONTAINER" ollama run mistral "ping" --verbose false 2>/dev/null || true
docker exec "$CONTAINER" ollama run nomic-embed-text "warmup" --verbose false 2>/dev/null || true
