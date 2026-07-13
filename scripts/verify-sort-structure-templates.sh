#!/usr/bin/env bash
# Verify sort structure template backend tests and key modules import.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
python3 -m pytest tests/test_sort_structure*.py tests/test_property_fingerprint.py tests/test_analyze_policy_structure.py -q
python3 -c "from sort_structure import compile_classify_contract, finalize_structure_caps; print('sort_structure ok')"
