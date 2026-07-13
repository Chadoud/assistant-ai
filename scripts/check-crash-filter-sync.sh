#!/usr/bin/env bash
# Fail when crash filter predicates drift between PHP, JS, and SQL migration.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHP="$ROOT/datasuite/lib/CrashFilter.php"
JS="$ROOT/cloud-node/lib/crashFilter.js"
SQL="$ROOT/cloud-node/migrations/022_crash_filter_views.sql"

for f in "$PHP" "$JS" "$SQL"; do
  if [[ ! -f "$f" ]]; then
    echo "Missing: $f" >&2
    exit 1
  fi
done

check_marker() {
  local marker="$1"
  local missing=0
  for f in "$PHP" "$JS" "$SQL"; do
    if ! grep -q "$marker" "$f"; then
      echo "Missing marker '$marker' in $f" >&2
      missing=1
    fi
  done
  return "$missing"
}

fail=0
check_marker "Test error for pytest" || fail=1
check_marker "0.0.0-test" || fail=1
check_marker "crash-ingest-selftest" || fail=1
check_marker "Automated verify" || fail=1
check_marker "[archived_test]" || fail=1

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "OK — crash filter markers aligned across PHP, JS, and SQL."
