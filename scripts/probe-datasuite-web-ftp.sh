#!/usr/bin/env bash
# Test Web hosting FTP for datasuite.exosites.ch (not api.exosites.ch).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib/infomaniak-ftp.sh
source "${ROOT}/scripts/lib/infomaniak-ftp.sh"

infomaniak_ftp_load_env "${ROOT}/datasuite/.env.deploy"
infomaniak_ftp_assert_datasuite_path "$REMOTE_PATH"

echo "ftp://${FTP_HOST}/"
curl -sS --ftp-pasv -u "${FTP_USER}:${FTP_PASSWORD}" "ftp://${FTP_HOST}/" --list-only

echo ""
echo "ftp://${FTP_HOST}/${REMOTE_PATH}/"
curl -sS --ftp-pasv -u "${FTP_USER}:${FTP_PASSWORD}" "ftp://${FTP_HOST}/${REMOTE_PATH}/" --list-only
