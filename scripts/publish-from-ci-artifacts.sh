#!/usr/bin/env bash
# Cheapest high-quality publish: reuse CI-built installers (no rebuild).
#
# CI already built universal Mac (Intel + Apple Silicon backends) + Windows on
# Build Installers. This script either re-runs only the failed publish jobs
# (~2–5 min Linux) or downloads artifacts and uploads from your Mac (0 CI build minutes).
#
# Prerequisites (pick one path):
#   A) gh auth login  →  rerun failed publish jobs (uses repo secrets on GitHub)
#   B) cloud-node/.env.deploy  →  local rsync upload (see .env.deploy.example)
#
# Usage:
#   ./scripts/publish-from-ci-artifacts.sh              # auto: rerun if gh authed, else local
#   ./scripts/publish-from-ci-artifacts.sh rerun        # gh run rerun --failed only
#   ./scripts/publish-from-ci-artifacts.sh local        # download artifacts + upload
#   ./scripts/publish-from-ci-artifacts.sh local ./ci-artifacts   # use manual UI downloads
#
# Optional env:
#   CI_RUN_ID=28266776173   default: latest failed/success Build Installers run for current version tag
#   RELEASE_VERSION=1.1.20
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${ROOT}/dist-installer"
WORKFLOW="Build Installers"
VERSION="${RELEASE_VERSION:-$(node -p "require('${ROOT}/package.json').version")}"
TAG="v${VERSION}"
MODE="${1:-auto}"
MANUAL_DIR="${2:-}"

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
  if ! gh_authed; then
    return 1
  fi
  local id
  id="$(gh run list --workflow="$WORKFLOW" --limit 30 --json databaseId,headBranch,conclusion,status \
    | node -e "
const runs = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const tag = process.env.TAG;
const hit = runs.find(r => r.headBranch === tag);
if (hit) process.stdout.write(String(hit.databaseId));
")"
  [[ -n "$id" ]] || return 1
  echo "$id"
}

rerun_publish_jobs() {
  local run_id="$1"
  echo -e "${GREEN}==> Re-running ONLY failed jobs on run ${run_id}${NC}"
  echo "    (publish-release + publish-website — reuses EXO-macOS / EXO-Windows artifacts)"
  gh run rerun "$run_id" --failed
  echo -e "${GREEN}==> Watching run…${NC}"
  gh run watch "$run_id" --exit-status
  echo -e "${GREEN}Done.${NC} Check https://exosites.ch/downloads/exo-assistant/latest.json"
}

stage_from_dir() {
  local src="$1"
  mkdir -p "$DIST"
  shopt -s nullglob
  for f in "$src"/*; do
    cp -f "$f" "$DIST/"
  done
  shopt -u nullglob
}

download_ci_artifacts() {
  local run_id="$1"
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  echo -e "${GREEN}==> Downloading EXO-macOS + EXO-Windows from run ${run_id}${NC}"
  gh run download "$run_id" -n EXO-macOS -D "${tmp}/mac"
  gh run download "$run_id" -n EXO-Windows -D "${tmp}/win"

  mkdir -p "$DIST"
  shopt -s nullglob
  cp -f "${tmp}/mac"/* "$DIST/"
  cp -f "${tmp}/win"/* "$DIST/"
  shopt -u nullglob

  echo -e "${GREEN}Staged in ${DIST}:${NC}"
  ls -lh "$DIST"
}

verify_mac_quality() {
  local dmg="${DIST}/Exo.dmg"
  if [[ ! -f "$dmg" ]]; then
    echo -e "${RED}Missing ${dmg} — Mac artifact incomplete${NC}"
    exit 1
  fi
  echo -e "${GREEN}==> Verifying Intel + Apple Silicon backend slices (CI-quality check)${NC}"
  bash "${ROOT}/scripts/verify-mac-backend-slices-from-dmg.sh" "$dmg"
}

upload_to_exosites() {
  if [[ ! -f "${ROOT}/cloud-node/.env.deploy" ]]; then
    echo -e "${RED}Missing cloud-node/.env.deploy${NC}"
    echo "Copy cloud-node/.env.deploy.example and set DOWNLOADS_SSH_* (exosites.ch Web account)."
    exit 1
  fi
  echo -e "${GREEN}==> Uploading to exosites.ch (SKIP_BUILD=1)${NC}"
  SKIP_BUILD=1 RELEASE_VERSION="$VERSION" bash "${ROOT}/scripts/publish-downloads-local.sh"
}

upload_github_release() {
  if ! gh_authed; then
    echo -e "${YELLOW}Skipping GitHub Release upload (gh not authed)${NC}"
    return
  fi
  if ! gh release view "$TAG" >/dev/null 2>&1; then
    echo -e "${GREEN}==> Creating GitHub pre-release ${TAG}${NC}"
    local notes_file
    notes_file="$(mktemp)"
    awk -v ver="$VERSION" '
      $0 ~ "^## \\[" ver "\\]" { f = 1; next }
      f && /^## \[/ { exit }
      f { print }
    ' "${ROOT}/CHANGELOG.md" > "$notes_file"
    gh release create "$TAG" --prerelease --notes-file "$notes_file" \
      "${DIST}/Exo.dmg" \
      "${DIST}/Exo Setup.exe" 2>/dev/null || \
    gh release create "$TAG" --prerelease --generate-notes \
      "${DIST}/Exo.dmg" \
      "${DIST}/Exo Setup.exe"
    rm -f "$notes_file"
    return
  fi
  echo -e "${GREEN}==> Uploading assets to existing release ${TAG}${NC}"
  gh release upload "$TAG" "${DIST}/Exo.dmg" "${DIST}/Exo Setup.exe" --clobber
}

local_publish() {
  local run_id="${1:-}"
  if [[ -n "$MANUAL_DIR" ]]; then
    echo -e "${GREEN}==> Staging from manual download: ${MANUAL_DIR}${NC}"
    stage_from_dir "$MANUAL_DIR"
  elif [[ -n "$run_id" ]] && gh_authed; then
    download_ci_artifacts "$run_id"
  else
    echo -e "${RED}Local publish needs either:${NC}"
    echo "  1. gh auth login  (to download artifacts), or"
    echo "  2. ./scripts/publish-from-ci-artifacts.sh local /path/to/extracted-artifacts"
    echo ""
    echo "Manual download: GitHub → Actions → Build Installers run for ${TAG}"
    echo "  → Artifacts → EXO-macOS + EXO-Windows → unzip both into one folder, then:"
    echo "  ./scripts/publish-from-ci-artifacts.sh local /path/to/folder"
    exit 1
  fi

  verify_mac_quality
  upload_to_exosites
  upload_github_release
  echo -e "${GREEN}Published ${TAG} from CI artifacts (no rebuild).${NC}"
}

main() {
  cd "$ROOT"
  export TAG

  local run_id=""
  if run_id="$(resolve_run_id 2>/dev/null)"; then
    echo -e "${GREEN}Build Installers run:${NC} ${run_id} (${TAG})"
  fi

  case "$MODE" in
    rerun)
      [[ -n "$run_id" ]] || { echo -e "${RED}Set CI_RUN_ID or gh auth login${NC}"; exit 1; }
      gh_authed || { echo -e "${RED}gh auth login required for rerun${NC}"; exit 1; }
      rerun_publish_jobs "$run_id"
      ;;
    local)
      local_publish "$run_id"
      ;;
    auto)
      if gh_authed && [[ -n "$run_id" ]]; then
        echo -e "${GREEN}Using cheapest path: re-run failed publish jobs only (~0 build minutes).${NC}"
        rerun_publish_jobs "$run_id" || {
          echo -e "${YELLOW}CI rerun blocked (budget?) — falling back to local upload.${NC}"
          local_publish "$run_id"
        }
      else
        echo -e "${YELLOW}gh not authed — using local artifact path.${NC}"
        local_publish "$run_id"
      fi
      ;;
    *)
      echo "Usage: $0 [auto|rerun|local] [manual-artifacts-dir]"
      exit 1
      ;;
  esac
}

main "$@"
