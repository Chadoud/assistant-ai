#!/usr/bin/env bash
# Path-aware local verification mirroring CI quality jobs (fail-fast).
#
# Usage:
#   bash scripts/verify-local.sh              # same as --quick
#   bash scripts/verify-local.sh --quick
#   bash scripts/verify-local.sh --ci-parity  # + Playwright smoke + unused:strict
#   bash scripts/verify-local.sh --release desktop
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE="quick"
RELEASE_KIND=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --quick) MODE="quick"; shift ;;
    --ci-parity) MODE="ci-parity"; shift ;;
    --release)
      MODE="release"
      RELEASE_KIND="${2:-}"
      if [[ -z "$RELEASE_KIND" ]]; then
        echo "usage: verify-local.sh --release desktop" >&2
        exit 2
      fi
      shift 2
      ;;
    -h|--help)
      cat <<'EOF'
Path-aware local verification mirroring CI quality jobs (fail-fast).

Usage:
  bash scripts/verify-local.sh              # same as --quick
  bash scripts/verify-local.sh --quick
  bash scripts/verify-local.sh --ci-parity  # + Playwright smoke + unused:strict
  bash scripts/verify-local.sh --release desktop
EOF
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "$MODE" == "release" ]]; then
  if [[ "$RELEASE_KIND" == "desktop" ]]; then
    exec bash scripts/release-desktop.sh
  else
    echo "usage: verify-local.sh --release desktop" >&2
    exit 2
  fi
fi

CHANGED_FILE="$(mktemp)"
cleanup() { rm -f "$CHANGED_FILE"; }
trap cleanup EXIT

collect_changed() {
  local base=""
  if git rev-parse --abbrev-ref '@{upstream}' >/dev/null 2>&1; then
    base="$(git merge-base '@{upstream}' HEAD 2>/dev/null || true)"
  fi
  if [[ -z "$base" ]] && git rev-parse --verify origin/main >/dev/null 2>&1; then
    base="$(git merge-base origin/main HEAD 2>/dev/null || true)"
  fi
  if [[ -n "$base" ]]; then
    git diff --name-only "${base}...HEAD" >>"$CHANGED_FILE" || true
  fi
  git diff --name-only >>"$CHANGED_FILE" || true
  git diff --name-only --cached >>"$CHANGED_FILE" || true
  sort -u "$CHANGED_FILE" -o "$CHANGED_FILE"
}

collect_changed

has_prefix() {
  local prefix="$1"
  grep -E "^${prefix}" "$CHANGED_FILE" >/dev/null 2>&1
}

has_exact() {
  local name="$1"
  grep -Fx "$name" "$CHANGED_FILE" >/dev/null 2>&1
}

NEED_BACKEND=0
NEED_FRONTEND=0
NEED_ELECTRON=0
NEED_IPC=0
NEED_VERSION=0

if [[ ! -s "$CHANGED_FILE" ]]; then
  echo "==> No changed-file set detected; running core path checks"
  NEED_BACKEND=1
  NEED_FRONTEND=1
  NEED_ELECTRON=1
  NEED_IPC=1
else
  has_prefix 'backend/' && NEED_BACKEND=1
  has_prefix 'sync/' && NEED_BACKEND=1
  has_prefix 'frontend/' && NEED_FRONTEND=1
  has_prefix 'electron/' && NEED_ELECTRON=1

  if [[ "$NEED_ELECTRON" == "1" ]] || has_exact 'frontend/src/types/electron.d.ts' || has_exact 'electron/api-channels.manifest.json' || has_exact 'electron/preload.js'; then
    NEED_IPC=1
  fi

  has_exact 'package.json' && NEED_VERSION=1
  has_exact 'CHANGELOG.md' && NEED_VERSION=1
  has_exact 'installer.iss' && NEED_VERSION=1
  grep -E 'appVersion\.ts$' "$CHANGED_FILE" >/dev/null 2>&1 && NEED_VERSION=1
fi

echo "==> verify-local (${MODE})"
echo "    backend=${NEED_BACKEND} frontend=${NEED_FRONTEND} electron=${NEED_ELECTRON} ipc=${NEED_IPC} version=${NEED_VERSION}"

run_backend_import_smokes() {
  echo "==> Backend import smokes"
  (
    cd backend
    python3 -c "
from voice_session import GEMINI_VOICE_MODEL_DEFAULT, resolve_gemini_voice_model
assert GEMINI_VOICE_MODEL_DEFAULT, 'GEMINI_VOICE_MODEL_DEFAULT missing'
assert callable(resolve_gemini_voice_model)
print('voice_session re-exports OK:', GEMINI_VOICE_MODEL_DEFAULT)
"
    python3 -c "
import main
assert getattr(main, 'app', None) is not None or callable(getattr(main, 'create_app', None))
print('backend main import OK')
"
  )
}

echo "==> Secret logging audit"
node scripts/audit-secret-logging.cjs
echo "==> Tracked env secret audit"
bash scripts/audit-env-secrets-in-repo.sh

if [[ "$NEED_IPC" == "1" || "$NEED_ELECTRON" == "1" ]]; then
  echo "==> Electron IPC + d.ts parity"
  node scripts/validate-electron-ipc-manifest.cjs
  node scripts/validate-electron-dts.cjs
fi

if [[ "$NEED_VERSION" == "1" ]]; then
  echo "==> Release version contract"
  npm run verify:release-version
fi

if [[ "$NEED_BACKEND" == "1" ]]; then
  run_backend_import_smokes
  echo "==> Backend pytest"
  npm run test:backend
fi

if [[ "$NEED_FRONTEND" == "1" ]]; then
  echo "==> Frontend lint"
  npm run lint
  echo "==> Locale key parity"
  (cd frontend && npm run check-locale-keys)
  echo "==> Frontend build (tsc + vite)"
  npm run build:frontend
  echo "==> Frontend unit tests"
  (cd frontend && npm test)
fi

if [[ "$NEED_ELECTRON" == "1" ]]; then
  echo "==> Electron tests"
  npm run test:electron
fi


if [[ "$MODE" == "ci-parity" ]]; then
  echo "==> Unused exports (strict)"
  npm run check:unused:strict
  echo "==> Playwright e2e smoke (install chromium if needed)"
  if ! (cd frontend && npx playwright install --with-deps chromium); then
    echo "ERROR: Playwright browser install failed. Fix network/deps, then re-run." >&2
    exit 1
  fi
  (cd frontend && CI=true npm run test:e2e:smoke)
fi

echo ""
echo "verify-local (${MODE}) passed."
