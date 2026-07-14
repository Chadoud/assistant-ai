#!/usr/bin/env bash
# Build (optional) + publish desktop installers to exosites.ch Web hosting.
#
# Downloads live on the **exosites.ch Web** SSH account (same as exosites-agency),
# NOT on the api.exosites.ch Node host used by deploy-cloud-api.sh.
#
# Setup (cloud-node/.env.deploy):
#   DOWNLOADS_SSH_USER, DOWNLOADS_SSH_HOST, DOWNLOADS_SSH_PASSWORD
#   DOWNLOADS_REMOTE_PATH=./sites/exosites.ch/downloads/exo-assistant
# Optional signing/notarize (export before running or add to .env.deploy):
#   MAC_SIGN_IDENTITY, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
#
# Usage:
#   ./scripts/publish-downloads-local.sh              # universal build + upload
#   SKIP_BUILD=1 ./scripts/publish-downloads-local.sh # upload dist-installer/ only
#   BUILD_ONLY=1 ./scripts/publish-downloads-local.sh # build only, no rsync
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/cloud-node/.env.deploy"
DIST="${ROOT}/dist-installer"
FEED_BASE="${EXOSITES_UPDATE_FEED_URL:-https://exosites.ch/downloads/exo-assistant}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}Missing ${ENV_FILE}${NC}"
  echo "Copy cloud-node/.env.deploy.example and set DOWNLOADS_SSH_* + DOWNLOADS_REMOTE_PATH."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DOWNLOADS_SSH_USER:?Set DOWNLOADS_SSH_USER in cloud-node/.env.deploy (exosites.ch Web — see exosites-agency .env)}"
: "${DOWNLOADS_SSH_HOST:?Set DOWNLOADS_SSH_HOST in cloud-node/.env.deploy}"
: "${DOWNLOADS_REMOTE_PATH:?Set DOWNLOADS_REMOTE_PATH (e.g. ./sites/exosites.ch/downloads/exo-assistant)}"

VERSION="${RELEASE_VERSION:-$(node -p "require('${ROOT}/package.json').version")}"
if [[ "${SKIP_BUILD:-0}" == "1" && -z "${RELEASE_VERSION:-}" && -f "${DIST}/latest-mac.yml" ]]; then
  mac_yml_version=$(grep '^version:' "${DIST}/latest-mac.yml" | awk '{print $2}')
  if [[ -n "$mac_yml_version" ]]; then
    VERSION="$mac_yml_version"
  fi
fi
PUBLISH_DIR="${ROOT}/.publish-downloads"

run_downloads_ssh() {
  if [[ -n "${DOWNLOADS_SSH_PASSWORD:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -p "${DOWNLOADS_SSH_PASSWORD}" ssh -o StrictHostKeyChecking=accept-new \
      "${DOWNLOADS_SSH_USER}@${DOWNLOADS_SSH_HOST}" "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new "${DOWNLOADS_SSH_USER}@${DOWNLOADS_SSH_HOST}" "$@"
  fi
}

write_latest_json() {
  local notes
  notes=$(awk -v ver="$VERSION" '
    $0 ~ "^## \\[" ver "\\]" { f = 1; next }
    f && /^## \[/ { exit }
    f { print }
  ' "${ROOT}/CHANGELOG.md" | node "${ROOT}/scripts/format-changelog-notes.cjs")

  if [[ "$notes" == '""' || -z "$notes" ]]; then
    notes="\"Release ${VERSION}.\""
  fi

  mkdir -p "$PUBLISH_DIR"
  cat > "${PUBLISH_DIR}/latest.json" <<EOF
{
  "version": "${VERSION}",
  "notes": ${notes},
  "mac": "${FEED_BASE%/}/Exo.dmg",
  "windows": "${FEED_BASE%/}/Exo%20Setup.exe"
}
EOF
  echo -e "${GREEN}Wrote ${PUBLISH_DIR}/latest.json${NC}"
  cat "${PUBLISH_DIR}/latest.json"
}

collect_artifacts() {
  rm -rf "$PUBLISH_DIR"
  mkdir -p "$PUBLISH_DIR"

  local copied=0
  local to_copy=()

  for required in "Exo.dmg" "latest-mac.yml"; do
    [[ -f "${DIST}/${required}" ]] && to_copy+=("${DIST}/${required}")
  done

  if [[ -f "${DIST}/latest-mac.yml" ]]; then
    local zip_name
    zip_name=$(grep '^path:' "${DIST}/latest-mac.yml" | awk '{print $2}')
    if [[ -n "$zip_name" && -f "${DIST}/${zip_name}" ]]; then
      to_copy+=("${DIST}/${zip_name}")
    fi
  fi

  for win_file in "Exo Setup.exe" "latest.yml"; do
    [[ -f "${DIST}/${win_file}" ]] && to_copy+=("${DIST}/${win_file}")
  done

  if [[ ${#to_copy[@]} -eq 0 ]]; then
    echo -e "${RED}No installers in ${DIST}/ — run build first or unset SKIP_BUILD${NC}"
    exit 1
  fi

  for f in "${to_copy[@]}"; do
    cp -f "$f" "${PUBLISH_DIR}/"
    copied=1
    local base
    base=$(basename "$f")
    if [[ -f "${DIST}/${base}.blockmap" ]]; then
      cp -f "${DIST}/${base}.blockmap" "${PUBLISH_DIR}/"
    fi
  done

  write_latest_json
  echo -e "${GREEN}Publish bundle (${copied} primary artifacts + blockmaps):${NC}"
  ls -la "${PUBLISH_DIR}/"
}

maybe_build() {
  if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
    echo -e "${YELLOW}SKIP_BUILD=1 — using existing dist-installer/${NC}"
    return
  fi

  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo -e "${RED}Mac build requires macOS. Set SKIP_BUILD=1 to upload existing artifacts.${NC}"
    exit 1
  fi

  cd "$ROOT"
  if [[ -n "${MAC_SIGN_IDENTITY:-}" ]]; then
    echo -e "${GREEN}Signing identity:${NC} ${MAC_SIGN_IDENTITY}"
  else
    echo -e "${YELLOW}MAC_SIGN_IDENTITY not set — unsigned local build (Gatekeeper may warn).${NC}"
  fi

  if [[ -z "${APPLE_ID:-}" || -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" || -z "${APPLE_TEAM_ID:-}" ]]; then
    echo -e "${YELLOW}Apple notarize env incomplete — app will sign (if identity set) but may skip notarization.${NC}"
  fi

  echo -e "${GREEN}==> Building universal Mac release v${VERSION}${NC}"
  EXO_MAC_UNIVERSAL=1 npm run build:mac
}

upload_bundle() {
  if [[ "${BUILD_ONLY:-0}" == "1" ]]; then
    echo -e "${YELLOW}BUILD_ONLY=1 — skipping upload${NC}"
    return
  fi

  if ! command -v rsync >/dev/null 2>&1; then
    echo -e "${RED}rsync is required${NC}"
    exit 1
  fi

  local remote_path="${DOWNLOADS_REMOTE_PATH#./}"
  local dest="${DOWNLOADS_SSH_USER}@${DOWNLOADS_SSH_HOST}:${remote_path%/}/"
  echo -e "${GREEN}==> Ensuring remote directory exists${NC}"
  run_downloads_ssh "mkdir -p ${remote_path}"

  echo -e "${GREEN}==> Uploading to ${dest}${NC}"
  if [[ -n "${DOWNLOADS_SSH_PASSWORD:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -p "${DOWNLOADS_SSH_PASSWORD}" rsync -avz --progress -e "ssh -o StrictHostKeyChecking=accept-new" \
      "${PUBLISH_DIR}/" "$dest"
  else
    rsync -avz --progress -e "ssh -o StrictHostKeyChecking=accept-new" \
      "${PUBLISH_DIR}/" "$dest"
  fi

  echo -e "${GREEN}==> Verifying latest.json on server${NC}"
  run_downloads_ssh "test -f ${remote_path%/}/latest.json && head -c 400 ${remote_path%/}/latest.json"
  echo ""
  echo -e "${GREEN}Done.${NC} Feed: ${FEED_BASE%/}/latest.json"
}

maybe_build
collect_artifacts
upload_bundle
