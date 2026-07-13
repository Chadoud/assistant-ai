#!/usr/bin/env bash
# lint-staged wrapper — skip deleted paths so ruff does not fail on E902.
set -euo pipefail

existing=()
for file_path in "$@"; do
  if [[ -f "$file_path" ]]; then
    existing+=("$file_path")
  fi
done

if [[ ${#existing[@]} -eq 0 ]]; then
  exit 0
fi

ruff check --fix "${existing[@]}"
