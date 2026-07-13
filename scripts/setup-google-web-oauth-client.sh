#!/usr/bin/env bash
# Patch cloud-node/.env with a Web OAuth client and open Google Cloud setup.
#
# Usage:
#   ./scripts/setup-google-web-oauth-client.sh
#   ./scripts/setup-google-web-oauth-client.sh CLIENT_ID CLIENT_SECRET
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/cloud-node/.env"
PROJECT="${GOOGLE_CLOUD_PROJECT:-openjarvis-493910}"
REDIRECT_URI="https://api.exosites.ch/auth/google/callback"

CLIENT_ID="${1:-}"
CLIENT_SECRET="${2:-}"

if [[ -z "${CLIENT_ID}" ]]; then
  echo "Opening Google Cloud → Create OAuth client (Web application)"
  echo "  Project: ${PROJECT}"
  echo "  Redirect URI: ${REDIRECT_URI}"
  open "https://console.cloud.google.com/apis/credentials/oauthclient?project=${PROJECT}" 2>/dev/null || true
  open "https://console.cloud.google.com/apis/credentials/consent?project=${PROJECT}" 2>/dev/null || true
  echo ""
  read -r -p "Paste GOOGLE_CLIENT_ID: " CLIENT_ID
  read -r -s -p "Paste GOOGLE_CLIENT_SECRET: " CLIENT_SECRET
  echo ""
fi

if [[ -z "${CLIENT_ID}" || -z "${CLIENT_SECRET}" ]]; then
  echo "Client ID and secret required."
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  exit 1
fi

python3 - <<PY
from pathlib import Path
import re
path = Path("${ENV_FILE}")
text = path.read_text()
text = re.sub(r'^GOOGLE_CLIENT_ID=.*$', 'GOOGLE_CLIENT_ID=${CLIENT_ID}', text, flags=re.M)
text = re.sub(r'^GOOGLE_CLIENT_SECRET=.*$', 'GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}', text, flags=re.M)
path.write_text(text)
print(f"Updated {path}")
PY

echo "Next:"
echo "  ./scripts/deploy-cloud-api.sh"
echo "  ./scripts/verify-cloud-auth-api.sh"
