#!/usr/bin/env bash
# Image sort accuracy regression gate (hybrid extract + folder catalog + gates).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
python3 -m pytest -q \
  tests/test_image_hybrid_extract.py \
  tests/test_folder_catalog.py \
  tests/test_analyze_policy.py \
  tests/test_ingestor_quality.py \
  tests/test_semantic_rerank.py
