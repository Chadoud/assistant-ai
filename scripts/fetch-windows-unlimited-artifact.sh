#!/usr/bin/env bash
# Download "Exo Unlimited Setup.exe" from GitHub Actions (internal build — never on exosites.ch).
#
# Prerequisites:
#   gh auth login
#   Push this repo so .github/workflows/build-windows-unlimited.yml exists on GitHub.
#
# Usage:
#   ./scripts/fetch-windows-unlimited-artifact.sh           # trigger build + download
#   SKIP_TRIGGER=1 ./scripts/fetch-windows-unlimited-artifact.sh   # download latest run only
#   CI_RUN_ID=12345678 ./scripts/fetch-windows-unlimited-artifact.sh
#
# Output:
#   dist-installer-unlimited/Exo Unlimited Setup.exe
#   dist-app-unlimited/Exo/Exo.exe
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW_FILE="build-windows-unlimited.yml"
WORKFLOW_NAME="Build Windows Unlimited"
ARTIFACT_NAME="EXO-Windows-Unlimited"
OUT_INSTALLER="${ROOT}/dist-installer-unlimited"
OUT_PORTABLE="${ROOT}/dist-app-unlimited"
STAGING="${ROOT}/.ci-artifacts-unlimited"

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
  id="$(gh run list --workflow="$WORKFLOW_FILE" --limit 1 --json databaseId,status,conclusion \
    | node -e "
const runs = JSON.parse(require('fs').readFileSync(0, 'utf8'));
if (runs[0]) process.stdout.write(String(runs[0].databaseId));
")"
  [[ -n "$id" ]] || return 1
  echo "$id"
}

stage_download() {
  local src="$1"
  mkdir -p "$OUT_INSTALLER" "$OUT_PORTABLE"

  local installer=""
  installer="$(find "$src" -name 'Exo Unlimited Setup.exe' -print -quit 2>/dev/null || true)"
  if [[ -n "$installer" ]]; then
    cp -f "$installer" "${OUT_INSTALLER}/Exo Unlimited Setup.exe"
    echo -e "${GREEN}Installer:${NC} ${OUT_INSTALLER}/Exo Unlimited Setup.exe"
  fi

  local portable=""
  portable="$(find "$src" -path '*/dist-app-unlimited/Exo/Exo.exe' -print -quit 2>/dev/null || true)"
  if [[ -z "$portable" ]]; then
    portable="$(find "$src" -path '*/Exo/Exo.exe' -print -quit 2>/dev/null || true)"
  fi
  if [[ -n "$portable" ]]; then
    rm -rf "${OUT_PORTABLE}/Exo"
    mkdir -p "${OUT_PORTABLE}/Exo"
    cp -R "$(dirname "$portable")/"* "${OUT_PORTABLE}/Exo/"
    echo -e "${GREEN}Portable:${NC}  ${OUT_PORTABLE}/Exo/Exo.exe"
  fi

  if [[ -z "$installer" && -z "$portable" ]]; then
    echo -e "${RED}Artifact downloaded but Exo Unlimited Setup.exe not found under ${src}${NC}"
    find "$src" -maxdepth 4 -type f | head -30
    exit 1
  fi
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
    sleep 8
    run_id="$(gh run list --workflow="$WORKFLOW_FILE" --limit 1 --json databaseId,status \
      | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'))[0]; if(r) process.stdout.write(String(r.databaseId));")"
    [[ -n "$run_id" ]] || { echo -e "${RED}Could not find workflow run${NC}"; exit 1; }
    echo -e "${GREEN}==> Watching run ${run_id}${NC}"
    gh run watch "$run_id" --exit-status
  else
    run_id="$(resolve_run_id)" || true
    [[ -n "$run_id" ]] || { echo -e "${RED}No run found. Unset SKIP_TRIGGER or set CI_RUN_ID.${NC}"; exit 1; }
    echo -e "${GREEN}==> Using existing run ${run_id}${NC}"
    gh run view "$run_id" --json conclusion,status \
      | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); if(r.conclusion&&r.conclusion!=='success'){console.error('Run not successful:', r.conclusion); process.exit(1);}"
  fi

  rm -rf "$STAGING"
  mkdir -p "$STAGING"
  echo -e "${GREEN}==> Downloading artifact ${ARTIFACT_NAME}${NC}"
  gh run download "$run_id" --name "$ARTIFACT_NAME" --dir "$STAGING"
  stage_download "$STAGING"
  rm -rf "$STAGING"

  echo -e "${GREEN}Done.${NC} Send ${OUT_INSTALLER}/Exo Unlimited Setup.exe — it is not published on exosites.ch."
}

main "$@"
