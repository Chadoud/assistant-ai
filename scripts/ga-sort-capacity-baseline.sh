#!/usr/bin/env bash
# Record sort capacity baseline (5 + 10 simulated users). Requires LITELLM_MASTER_KEY.
#
# Usage:
#   ./scripts/ga-sort-capacity-baseline.sh
#   USE_SORT_QUEUE=1 ./scripts/ga-sort-capacity-baseline.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "${ROOT}/scripts/ga-sort-capacity-baseline.py" "$@"
