#!/usr/bin/env bash
# Create or confirm the GA verify login account (run once).
#
# Usage:
#   cp cloud-node/.env.verify.example cloud-node/.env.verify
#   # Edit GA_VERIFY_PASSWORD in .env.verify
#   ./scripts/ga-provision-verify-account.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/cloud-node/.env.verify"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Copy cloud-node/.env.verify.example → cloud-node/.env.verify and set GA_VERIFY_PASSWORD"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${GA_VERIFY_EMAIL:?Set GA_VERIFY_EMAIL in .env.verify}"
: "${GA_VERIFY_PASSWORD:?Set GA_VERIFY_PASSWORD in .env.verify}"

BASE="${CLOUD_API_BASE:-https://api.exosites.ch}"

login_code="$(curl -sS -o /tmp/ga-login.json -w '%{http_code}' -X POST "${BASE}/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${GA_VERIFY_EMAIL}\",\"password\":\"${GA_VERIFY_PASSWORD}\",\"first_name\":\"GA\",\"last_name\":\"Verify\"}")"

if [[ "$login_code" == "200" ]]; then
  echo "OK: verify account already exists — login works"
  exit 0
fi

reg_code="$(curl -sS -o /tmp/ga-reg.json -w '%{http_code}' -X POST "${BASE}/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${GA_VERIFY_EMAIL}\",\"password\":\"${GA_VERIFY_PASSWORD}\",\"first_name\":\"GA\",\"last_name\":\"Verify\"}")"

if [[ "$reg_code" == "200" ]]; then
  echo "OK: created verify account ${GA_VERIFY_EMAIL}"
  exit 0
fi

echo "Failed login HTTP ${login_code} register HTTP ${reg_code}"
cat /tmp/ga-login.json /tmp/ga-reg.json 2>/dev/null || true
exit 1
