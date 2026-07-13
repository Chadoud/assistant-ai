#!/usr/bin/env bash
# Windows unlimited-entitlement build entry point.
# Must run on Windows (PyInstaller + manual Electron packager).
#
# Output:
#   dist-app-unlimited/Exo/
#   dist-installer-unlimited/Exo Unlimited Setup.exe
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != MINGW* ]] && [[ "$(uname -s)" != MSYS* ]] && [[ "${OS:-}" != Windows_NT ]]; then
  echo "This script must run on Windows."
  echo "From macOS/Linux, trigger GitHub Actions: gh workflow run build-windows-unlimited.yml"
  exit 1
fi

powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-win-unlimited.ps1
