#!/usr/bin/env bash
# Deploy DataSuite (PHP) to Infomaniak Web hosting only.
#
#   datasuite.exosites.ch  →  datasuite/.env.deploy  →  this script
#   api.exosites.ch        →  cloud-node/.env.deploy   →  deploy-cloud-api.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/lib/infomaniak-ftp.sh
source "${ROOT}/scripts/lib/infomaniak-ftp.sh"

DS_DIR="${ROOT}/datasuite"
WEB_DIR="${DS_DIR}/web"
LIB_DIR="${DS_DIR}/lib"
ENV_FILE="${DS_DIR}/.env.deploy"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

infomaniak_ftp_load_env "$ENV_FILE"
infomaniak_ftp_assert_datasuite_path "$REMOTE_PATH"

echo -e "${GREEN}Building DataSuite assets…${NC}"
cd "$DS_DIR"
if [[ ! -d node_modules ]]; then
  npm install
fi
npm run build

if [[ ! -f "${WEB_DIR}/assets/app.js" ]]; then
  echo -e "${RED}Build failed — missing web/assets/app.js${NC}"
  exit 1
fi

echo -e "${GREEN}Deploying → ftp://${FTP_HOST}/${REMOTE_PATH}${NC}"
infomaniak_ftp_upload_tree "${WEB_DIR}" "${REMOTE_PATH}"
infomaniak_ftp_upload_tree "${LIB_DIR}" "${REMOTE_PATH}/_lib"

if [[ "${UPLOAD_ENV:-0}" == "1" ]]; then
  if [[ ! -f "${DS_DIR}/.env.server" ]]; then
    echo -e "${RED}Missing datasuite/.env.server — run: npm run datasuite:generate-env${NC}"
    exit 1
  fi
  echo -e "${YELLOW}Uploading .env …${NC}"
  infomaniak_ftp_upload "${DS_DIR}/.env.server" "${REMOTE_PATH}/.env"
fi

infomaniak_ftp_delete "${REMOTE_PATH}/index.html"

if [[ "${VERIFY_AFTER_DEPLOY:-0}" == "1" ]]; then
  echo -e "${YELLOW}Running verify…${NC}"
  "${ROOT}/scripts/verify-datasuite.sh" || {
    echo -e "${RED}Verify failed.${NC}"
    exit 1
  }
else
  echo "Verify: VERIFY_AFTER_DEPLOY=1 npm run deploy:datasuite"
fi

echo -e "${GREEN}Done.${NC}"
