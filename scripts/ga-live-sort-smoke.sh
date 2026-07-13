#!/usr/bin/env bash
# Live cloud sort smoke — 13 fixture files through /analyze on running dev backend.
#
# Usage:
#   npm run dev   # recommended (sets EXOSITES_USER_DATA automatically)
#   npm run ga:live-sort
#
# Bare backend:
#   export EXOSITES_USER_DATA="$HOME/Library/Application Support/EXO"  # macOS
#   cd backend && EXOSITES_INSECURE_LOCAL=1 python -m uvicorn main:app --host 127.0.0.1 --port 7799
#   npm run ga:live-sort
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${EXOSITES_USER_DATA:-}" ]]; then
  case "$(uname -s)" in
    Darwin) export EXOSITES_USER_DATA="${HOME}/Library/Application Support/EXO" ;;
    Linux) export EXOSITES_USER_DATA="${HOME}/.config/Exo" ;;
    MINGW*|MSYS*|CYGWIN*)
      if [[ -n "${APPDATA:-}" ]]; then
        export EXOSITES_USER_DATA="${APPDATA}/Exo"
      fi
      ;;
  esac
fi

export EXOSITES_INSECURE_LOCAL="${EXOSITES_INSECURE_LOCAL:-1}"
exec python3 "${ROOT}/scripts/ga-live-sort-smoke.py" "$@"
