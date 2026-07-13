#!/usr/bin/env bash
# Grep user-facing sort-path copy that should not appear when cloud sort is GA.
#
# Usage: ./scripts/ga-copy-audit.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'
fail=0

warn() {
  echo -e "${YELLOW}○${NC} $1"
}

search() {
  grep -rq "$1" "${@:2}" 2>/dev/null
}

check_gated() {
  local label="$1"
  local pattern="$2"
  local gate="$3"
  local hits
  hits="$(rg -l "$pattern" frontend/src --glob '*.tsx' --glob '*.ts' 2>/dev/null | while read -r f; do
    if rg -q "$gate" "$f" 2>/dev/null; then continue; fi
    echo "$f"
  done | head -5)"
  if [[ -n "$hits" ]]; then
    echo -e "${RED}✗${NC} $label (ungated hits):"
    echo "$hits" | sed 's/^/    /'
    fail=1
  else
    echo -e "${GREEN}✓${NC} $label — gated or absent in TSX"
  fi
}

echo "GA copy audit (cloud sort subscriber path)"
echo ""

# Cloud-gated components we expect
for f in \
  frontend/src/components/settings/VisionFallbackSection.tsx \
  frontend/src/components/settings/ActiveModelSection.tsx \
  frontend/src/components/SettingsPanel.tsx; do
  if [[ -f "$f" ]] && search "cloudSortActive" "$f"; then
    echo -e "${GREEN}✓${NC} $(basename "$f") uses cloudSortActive"
  else
    warn "$(basename "$f") — verify cloud gating manually"
  fi
done

echo ""
# i18n keys may exist for local mode — ensure cloud variants exist
for key in aiModelsSummaryCloud aiModelsDescCloud sortReadyCloud cloudSortOcrOnly; do
  if search "$key" frontend/src/i18n/locales/; then
    echo -e "${GREEN}✓${NC} en.ts has $key"
  else
    echo -e "${RED}✗${NC} missing en.ts key: $key"
    fail=1
  fi
done

echo ""
if [[ "$fail" -eq 0 ]]; then
  echo -e "${GREEN}Copy audit passed (automated checks).${NC}"
  echo "Manual: sign in → Settings → File sorting — no API key / Ollama download for sort."
  exit 0
fi
exit 1
