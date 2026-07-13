#!/usr/bin/env bash
# Download standard Exo.dmg + Exo Setup.exe from GitHub Actions (public release build).
#
# Prerequisites: gh auth login
#
# Usage:
#   ./scripts/fetch-general-installers.sh              # trigger Build Installers + download
#   SKIP_TRIGGER=1 ./scripts/fetch-general-installers.sh
#   CI_RUN_ID=12345678 ./scripts/fetch-general-installers.sh
#
# Output:
#   dist-installer/Exo.dmg
#   dist-installer/Exo Setup.exe
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW_FILE="build.yml"
WORKFLOW_NAME="Build Installers"
MAC_ARTIFACT="EXO-macOS"
WIN_ARTIFACT="EXO-Windows"
OUT="${ROOT}/dist-installer"
STAGING="${ROOT}/.ci-artifacts-general"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

gh_authed() {
  gh auth status >/dev/null 2>&1
}

resolve_run_id() {
  if [[ -n "${CI_RUN_ID:-}" ]]; then
    echo "$CI_RUN_ID"
    return
  fi
  local id
  id="$(gh run list --workflow="$WORKFLOW_FILE" --limit 1 --json databaseId \
    | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'))[0]; if(r) process.stdout.write(String(r.databaseId));")"
  [[ -n "$id" ]] || return 1
  echo "$id"
}

stage_download() {
  mkdir -p "$OUT"
  shopt -s nullglob
  for f in "$STAGING/mac"/* "$STAGING/win"/*; do
    cp -f "$f" "$OUT/"
  done
  shopt -u nullglob

  local missing=0
  for required in "Exo.dmg" "Exo Setup.exe"; do
    if [[ ! -f "${OUT}/${required}" ]]; then
      echo -e "${RED}Missing ${OUT}/${required}${NC}"
      missing=1
    fi
  done
  [[ "$missing" -eq 0 ]] || { ls -la "$OUT" "$STAGING" 2>/dev/null; exit 1; }

  echo -e "${GREEN}Mac:${NC}     ${OUT}/Exo.dmg"
  echo -e "${GREEN}Windows:${NC} ${OUT}/Exo Setup.exe"
  ls -lh "${OUT}/Exo.dmg" "${OUT}/Exo Setup.exe"
}

main() {
  if ! gh_authed; then
    echo -e "${RED}GitHub CLI not authenticated.${NC} Run: gh auth login"
    exit 1
  fi

  local run_id=""
  if [[ "${SKIP_TRIGGER:-}" != "1" ]]; then
    echo -e "${GREEN}==> Triggering ${WORKFLOW_NAME} on origin/master${NC}"
    gh workflow run "$WORKFLOW_FILE" --ref master
    echo -e "${YELLOW}Waiting for workflow run to appear…${NC}"
    sleep 10
    run_id="$(gh run list --workflow="$WORKFLOW_FILE" --limit 1 --json databaseId \
      | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'))[0]; if(r) process.stdout.write(String(r.databaseId));")"
    [[ -n "$run_id" ]] || { echo -e "${RED}Could not find workflow run${NC}"; exit 1; }
    echo -e "${GREEN}==> Watching run ${run_id}${NC}"
    gh run watch "$run_id" --exit-status
  else
    run_id="$(resolve_run_id)" || true
    [[ -n "$run_id" ]] || { echo -e "${RED}No run found.${NC}"; exit 1; }
    echo -e "${GREEN}==> Using existing run ${run_id}${NC}"
    gh run view "$run_id" --json conclusion \
      | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); if(r.conclusion&&r.conclusion!=='success'){console.error('Run not successful:', r.conclusion); process.exit(1);}"
  fi

  rm -rf "$STAGING"
  mkdir -p "$STAGING/mac" "$STAGING/win"
  echo -e "${GREEN}==> Downloading ${MAC_ARTIFACT} + ${WIN_ARTIFACT}${NC}"
  gh run download "$run_id" --name "$MAC_ARTIFACT" --dir "$STAGING/mac"
  gh run download "$run_id" --name "$WIN_ARTIFACT" --dir "$STAGING/win"
  stage_download "$STAGING"
  rm -rf "$STAGING"

  echo -e "${GREEN}Done.${NC} Standard installers in ${OUT}/"
}

main "$@"
