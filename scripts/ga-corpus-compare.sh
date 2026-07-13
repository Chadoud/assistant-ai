#!/usr/bin/env bash
# Compare two sort-plan CSV exports (automation ±2%, optional safety vs gold).
#
# Usage:
#   ./scripts/ga-corpus-compare.sh baseline.csv candidate.csv
#   ./scripts/ga-corpus-compare.sh baseline.csv candidate.csv gold.json
#
# Export sort plans from Exo after a run (review screen → export) or from job history.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE="${1:-}"
CANDIDATE="${2:-}"
GOLD="${3:-}"
TOLERANCE="${GA_CORPUS_TOLERANCE:-0.02}"

if [[ -z "$BASELINE" || -z "$CANDIDATE" ]]; then
  echo "Usage: $0 baseline.csv candidate.csv [gold.json]"
  exit 1
fi

for f in "$BASELINE" "$CANDIDATE"; do
  [[ -f "$f" ]] || { echo "Missing file: $f"; exit 1; }
done
BASELINE="$(cd "$(dirname "$BASELINE")" && pwd)/$(basename "$BASELINE")"
CANDIDATE="$(cd "$(dirname "$CANDIDATE")" && pwd)/$(basename "$CANDIDATE")"
if [[ -n "$GOLD" ]]; then
  [[ -f "$GOLD" ]] || { echo "Gold file not found: $GOLD"; exit 1; }
  GOLD="$(cd "$(dirname "$GOLD")" && pwd)/$(basename "$GOLD")"
fi

summarize() {
  local csv="$1"
  cd "${ROOT}/backend"
  python3 -c "
import json, pathlib, sys
from classify_eval.summarize_export import summarize, _load_gold
import csv

csv_path = pathlib.Path(sys.argv[1])
gold_path = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else ''
rows = list(csv.DictReader(csv_path.open(newline='', encoding='utf-8-sig')))
gold = _load_gold(pathlib.Path(gold_path)) if gold_path else None
print(json.dumps(summarize(rows, gold)))
" "$csv" "${GOLD:-}"
}

BASE_JSON="$(summarize "$BASELINE")"
CAND_JSON="$(summarize "$CANDIDATE")"

python3 -c "
import json, sys

tol = float(sys.argv[1])
base = json.loads(sys.argv[2])
cand = json.loads(sys.argv[3])

def pct(x):
    return f'{x:.1%}' if x is not None else 'n/a'

b_auto = base.get('automation_rate', 0)
c_auto = cand.get('automation_rate', 0)
delta = abs(c_auto - b_auto)
ok_auto = delta <= tol

print('Baseline rows:', base.get('rows'))
print('Candidate rows:', cand.get('rows'))
print(f'Automation baseline: {pct(b_auto)}')
print(f'Automation candidate: {pct(c_auto)}')
print(f'Delta: {delta:.1%} (tolerance ±{tol:.0%})')
print('Automation gate:', 'PASS' if ok_auto else 'FAIL')

if base.get('safety_rate_labeled_auto') is not None:
    b_safe = base['safety_rate_labeled_auto']
    c_safe = cand.get('safety_rate_labeled_auto')
    if c_safe is not None:
        d_safe = abs(c_safe - b_safe)
        ok_safe = d_safe <= tol
        print(f'Safety baseline: {pct(b_safe)} ({base.get(\"safety_pairs\")})')
        print(f'Safety candidate: {pct(c_safe)} ({cand.get(\"safety_pairs\")})')
        print(f'Safety delta: {d_safe:.1%}')
        print('Safety gate:', 'PASS' if ok_safe else 'FAIL')
        ok_auto = ok_auto and ok_safe

sys.exit(0 if ok_auto else 1)
" "$TOLERANCE" "$BASE_JSON" "$CAND_JSON"
