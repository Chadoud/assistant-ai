#!/usr/bin/env bash
# Remove legacy crash PHP sites from Web FTP (superseded by api.exosites.ch).
# Never touches exosites.ch, datasuite.exosites.ch, or api.exosites.ch.
#
# Usage:
#   ./scripts/cleanup-legacy-crash-web-ftp.sh          # dry-run (list only)
#   CONFIRM=1 ./scripts/cleanup-legacy-crash-web-ftp.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/lib/infomaniak-ftp.sh
source "${ROOT}/scripts/lib/infomaniak-ftp.sh"

infomaniak_ftp_load_env "${ROOT}/datasuite/.env.deploy"

LEGACY_PATHS=(
  "sites/crash-ingest"
  "sites/crash.exosites.ch"
)

FORBIDDEN=("exosites.ch" "datasuite.exosites.ch" "api.exosites.ch")

assert_safe_legacy_path() {
  local path="$1"
  for forbidden in "${FORBIDDEN[@]}"; do
    if [[ "$path" == *"$forbidden"* && "$path" != "sites/crash.exosites.ch" ]]; then
      echo "Refusing: path touches forbidden site (${forbidden})" >&2
      exit 1
    fi
  done
  case "$path" in
    sites/crash-ingest|sites/crash.exosites.ch) return 0 ;;
    *)
      echo "Refusing: not an approved legacy path (${path})" >&2
      exit 1
      ;;
  esac
}

for path in "${LEGACY_PATHS[@]}"; do
  assert_safe_legacy_path "$path"
  echo "=== ${path} ==="
  infomaniak_ftp_list "${path}/" 2>/dev/null || echo "(missing or empty)"
done

if [[ "${CONFIRM:-0}" != "1" ]]; then
  echo ""
  echo "Dry run only. To delete: CONFIRM=1 ./scripts/cleanup-legacy-crash-web-ftp.sh"
  exit 0
fi

for path in "${LEGACY_PATHS[@]}"; do
  echo "Removing ${path} …"
  infomaniak_ftp_remove_tree "$path"
  echo "  done"
done

echo "Legacy crash Web FTP folders removed."
