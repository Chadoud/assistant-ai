#!/usr/bin/env bash
# Promote a staged (or GitHub Release) desktop build to production — or rollback from LKG.
#
# Usage:
#   ./scripts/promote-desktop-feed.sh promote <version>     # e.g. 1.1.50
#   ./scripts/promote-desktop-feed.sh rollback
#
# Env (CI secrets or cloud-node/.env.deploy):
#   DOWNLOADS_SSH_USER / HOST / KEY_FILE  (or EXOSITES_DEPLOY_SSH_*)
#   DOWNLOADS_REMOTE_PATH                 prod   (or EXOSITES_DOWNLOADS_PATH)
#   DOWNLOADS_REMOTE_PATH_STAGING         staging (or EXOSITES_DOWNLOADS_STAGING_PATH)
#   DOWNLOADS_REMOTE_PATH_LKG             lkg     (or EXOSITES_DOWNLOADS_LKG_PATH)
#   UPDATE_FEED_PRIVATE_KEY_HEX           required for promote (rewrite + resign latest.json)
#
# Promote source (default github-release):
#   PROMOTE_SOURCE=github-release   # download tag v$VERSION assets via gh
#   PROMOTE_SOURCE=staging          # rsync from staging remote into publish/
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTION="${1:-}"
VERSION="${2:-}"
PROMOTE_SOURCE="${PROMOTE_SOURCE:-github-release}"
PUBLISH_DIR=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
  if [[ -n "${PUBLISH_DIR:-}" && -d "${PUBLISH_DIR}" ]]; then
    rm -rf "${PUBLISH_DIR}"
  fi
}
trap cleanup EXIT

load_env() {
  local env_file="${ROOT}/cloud-node/.env.deploy"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi

  DOWNLOADS_SSH_USER="${DOWNLOADS_SSH_USER:-${EXOSITES_DEPLOY_SSH_USER:-}}"
  DOWNLOADS_SSH_HOST="${DOWNLOADS_SSH_HOST:-${EXOSITES_DEPLOY_SSH_HOST:-}}"
  DOWNLOADS_SSH_KEY_FILE="${DOWNLOADS_SSH_KEY_FILE:-${EXOSITES_DEPLOY_SSH_KEY_FILE:-}}"
  if [[ -z "${DOWNLOADS_SSH_KEY_FILE:-}" && -f "${HOME}/.ssh/exosites_downloads_deploy" ]]; then
    DOWNLOADS_SSH_KEY_FILE="${HOME}/.ssh/exosites_downloads_deploy"
  fi

  PROD_PATH="${DOWNLOADS_REMOTE_PATH:-${EXOSITES_DOWNLOADS_PATH:-./sites/exosites.ch/downloads/exo-assistant}}"
  STAGING_PATH="${DOWNLOADS_REMOTE_PATH_STAGING:-${EXOSITES_DOWNLOADS_STAGING_PATH:-./sites/exosites.ch/downloads/exo-assistant-staging}}"
  LKG_PATH="${DOWNLOADS_REMOTE_PATH_LKG:-${EXOSITES_DOWNLOADS_LKG_PATH:-./sites/exosites.ch/downloads/exo-assistant-lkg}}"

  FEED_STABLE="$(node -p "require('${ROOT}/scripts/lib/desktop-feed-channels.cjs').getChannel('stable').publicBase")"
}

require_ssh() {
  if [[ -z "${DOWNLOADS_SSH_USER:-}" || -z "${DOWNLOADS_SSH_HOST:-}" ]]; then
    echo -e "${RED}Set DOWNLOADS_SSH_USER + DOWNLOADS_SSH_HOST (or EXOSITES_DEPLOY_SSH_*).${NC}" >&2
    exit 1
  fi
  if [[ -z "${DOWNLOADS_SSH_KEY_FILE:-}" || ! -f "${DOWNLOADS_SSH_KEY_FILE}" ]]; then
    if [[ -n "${EXOSITES_DEPLOY_SSH_PRIVATE_KEY:-}" ]]; then
      DOWNLOADS_SSH_KEY_FILE="$(mktemp)"
      printf '%s\n' "$EXOSITES_DEPLOY_SSH_PRIVATE_KEY" > "$DOWNLOADS_SSH_KEY_FILE"
      chmod 600 "$DOWNLOADS_SSH_KEY_FILE"
    else
      echo -e "${RED}Set DOWNLOADS_SSH_KEY_FILE or EXOSITES_DEPLOY_SSH_PRIVATE_KEY.${NC}" >&2
      exit 1
    fi
  fi
}

ssh_e() {
  printf 'ssh -i %q -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new' "${DOWNLOADS_SSH_KEY_FILE}"
}

run_ssh() {
  ssh -i "${DOWNLOADS_SSH_KEY_FILE}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new \
    "${DOWNLOADS_SSH_USER}@${DOWNLOADS_SSH_HOST}" "$@"
}

rsync_to() {
  local src="$1"
  local dest_path="$2"
  run_ssh "mkdir -p ${dest_path}"
  rsync -avz -e "$(ssh_e)" "${src}" "${DOWNLOADS_SSH_USER}@${DOWNLOADS_SSH_HOST}:${dest_path}/"
}

write_signed_latest() {
  local publish_dir="$1"
  local version="$2"
  local feed_base="$3"
  local notes
  notes=$(awk -v ver="$version" '
    $0 ~ "^## \\[" ver "\\]" { f = 1; next }
    f && /^## \[/ { exit }
    f { print }
  ' "${ROOT}/CHANGELOG.md" | node "${ROOT}/scripts/format-changelog-notes.cjs")
  if [[ "$notes" == '""' || -z "$notes" ]]; then
    notes="\"Release ${version}.\""
  fi
  cat > "${publish_dir}/latest.json" <<EOF
{
  "version": "${version}",
  "notes": ${notes},
  "mac": "${feed_base%/}/Exo.dmg",
  "windows": "${feed_base%/}/Exo%20Setup.exe"
}
EOF
  if [[ -z "${UPDATE_FEED_PRIVATE_KEY_HEX:-}" && -z "${UPDATE_FEED_PRIVATE_KEY_FILE:-}" ]]; then
    echo -e "${RED}UPDATE_FEED_PRIVATE_KEY_HEX (or _FILE) required to sign latest.json${NC}" >&2
    exit 1
  fi
  node "${ROOT}/tools/update-feed-keygen/sign-latest.cjs" "${publish_dir}/latest.json"
}

write_sha256sums() {
  local publish_dir="$1"
  (
    cd "$publish_dir"
    if command -v sha256sum >/dev/null 2>&1; then
      find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
    else
      find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS
    fi
  )
}

collect_from_github_release() {
  local version="$1"
  local publish_dir="$2"
  local tag="v${version}"
  if ! command -v gh >/dev/null 2>&1; then
    echo -e "${RED}gh CLI required for PROMOTE_SOURCE=github-release${NC}" >&2
    exit 1
  fi
  rm -rf "$publish_dir"
  mkdir -p "$publish_dir"
  echo -e "${GREEN}==> Downloading GitHub Release ${tag}${NC}"
  gh release download "$tag" --dir "$publish_dir" --clobber
  find "$publish_dir" -mindepth 2 -type f -exec mv -f {} "$publish_dir/" \;
  find "$publish_dir" -mindepth 1 -type d -empty -delete 2>/dev/null || true
}

collect_from_staging() {
  local publish_dir="$1"
  rm -rf "$publish_dir"
  mkdir -p "$publish_dir"
  echo -e "${GREEN}==> Pulling staging feed ${STAGING_PATH}${NC}"
  rsync -avz -e "$(ssh_e)" \
    "${DOWNLOADS_SSH_USER}@${DOWNLOADS_SSH_HOST}:${STAGING_PATH}/" \
    "${publish_dir}/"
}

snapshot_lkg() {
  echo -e "${GREEN}==> Snapshot prod → LKG (${LKG_PATH})${NC}"
  run_ssh "mkdir -p ${LKG_PATH} ${PROD_PATH}"
  run_ssh "if [ -f ${PROD_PATH}/latest.json ]; then rsync -a --delete ${PROD_PATH}/ ${LKG_PATH}/; else echo 'prod empty — skip LKG copy'; fi"
}

promote() {
  local version="$1"
  if [[ -z "$version" ]] || ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Usage: $0 promote <semver>" >&2
    exit 1
  fi
  load_env
  require_ssh
  node "${ROOT}/scripts/validate-release-version.mjs" --version "$version"

  PUBLISH_DIR="$(mktemp -d)"

  case "$PROMOTE_SOURCE" in
    github-release) collect_from_github_release "$version" "$PUBLISH_DIR" ;;
    staging) collect_from_staging "$PUBLISH_DIR" ;;
    *) echo -e "${RED}Unknown PROMOTE_SOURCE=${PROMOTE_SOURCE}${NC}" >&2; exit 1 ;;
  esac

  local yml
  yml=$(find "$PUBLISH_DIR" -name 'latest-mac.yml' | head -n 1 || true)
  if [[ -n "$yml" ]]; then
    node "${ROOT}/scripts/validate-release-version.mjs" --version "$version" --latest-mac-yml "$yml"
  else
    echo -e "${YELLOW}Warning: latest-mac.yml missing in promote bundle${NC}"
  fi

  write_signed_latest "$PUBLISH_DIR" "$version" "$FEED_STABLE"
  write_sha256sums "$PUBLISH_DIR"

  echo -e "${GREEN}Promote bundle:${NC}"
  ls -la "$PUBLISH_DIR"
  cat "${PUBLISH_DIR}/latest.json"

  snapshot_lkg
  echo -e "${GREEN}==> Uploading to production ${PROD_PATH}${NC}"
  rsync_to "${PUBLISH_DIR}/" "$PROD_PATH"

  echo -e "${GREEN}Done.${NC} Production feed: ${FEED_STABLE}/latest.json"
  if command -v gh >/dev/null 2>&1 && gh release view "v${version}" >/dev/null 2>&1; then
    echo -e "${GREEN}==> Marking GitHub Release v${version} as stable (not prerelease)${NC}"
    gh release edit "v${version}" --prerelease=false || true
  fi
}

rollback() {
  load_env
  require_ssh
  echo -e "${YELLOW}==> Restoring LKG → prod${NC}"
  run_ssh "test -f ${LKG_PATH}/latest.json"
  run_ssh "mkdir -p ${PROD_PATH} && rsync -a --delete ${LKG_PATH}/ ${PROD_PATH}/"
  echo -e "${GREEN}Rollback done.${NC} Prod latest.json:"
  run_ssh "head -c 500 ${PROD_PATH}/latest.json; echo"
}

case "$ACTION" in
  promote) promote "$VERSION" ;;
  rollback) rollback ;;
  *)
    echo "Usage: $0 promote <version> | $0 rollback" >&2
    exit 1
    ;;
esac
