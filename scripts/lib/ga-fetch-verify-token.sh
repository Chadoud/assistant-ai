#!/usr/bin/env bash
# Obtain a Bearer token for GA verify scripts (login preferred over register).
#
# Sources (first match wins):
#   1. EXOSITES_VERIFY_TOKEN env
#   2. GA_VERIFY_EMAIL + GA_VERIFY_PASSWORD env
#   3. cloud-node/.env.verify
#   4. POST /auth/register (unique email)
#
# Usage:
#   source scripts/lib/ga-fetch-verify-token.sh
#   source scripts/lib/ga-fetch-verify-token.sh https://api.exosites.ch
#
# Sets: GA_ACCESS_TOKEN, GA_AUTH_SOURCE, GA_REGISTER_RATE_LIMITED (0|1)
set -euo pipefail

_GA_FETCH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GA_API_BASE="${1:-${CLOUD_API_BASE:-https://api.exosites.ch}}"
GA_ACCESS_TOKEN="${EXOSITES_VERIFY_TOKEN:-}"
GA_AUTH_SOURCE=""
GA_REGISTER_RATE_LIMITED=0

if [[ -n "$GA_ACCESS_TOKEN" ]]; then
  GA_AUTH_SOURCE="EXOSITES_VERIFY_TOKEN"
  return 0 2>/dev/null || exit 0
fi

_verify_env="${_GA_FETCH_ROOT}/cloud-node/.env.verify"
if [[ -f "$_verify_env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$_verify_env"
  set +a
fi

_login() {
  local email="$1" password="$2"
  local raw code body
  raw="$(curl -sS -w $'\n%{http_code}' -X POST "${GA_API_BASE}/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" 2>/dev/null || printf '\n000')"
  code="${raw##*$'\n'}"
  body="${raw%$'\n'*}"
  if [[ "$code" == "200" ]] && echo "$body" | grep -q '"access_token"'; then
    GA_ACCESS_TOKEN="$(echo "$body" | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)"
    return 0
  fi
  return 1
}

if [[ -n "${GA_VERIFY_EMAIL:-}" && -n "${GA_VERIFY_PASSWORD:-}" ]]; then
  if _login "$GA_VERIFY_EMAIL" "$GA_VERIFY_PASSWORD"; then
    GA_AUTH_SOURCE="login"
    return 0 2>/dev/null || exit 0
  fi
fi

verify_email="ga-readiness-$(date +%s)@example.com"
reg_raw="$(curl -sS -w $'\n%{http_code}' -X POST "${GA_API_BASE}/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${verify_email}\",\"password\":\"readiness123\",\"first_name\":\"GA\",\"last_name\":\"Readiness\"}" 2>/dev/null || printf '\n000')"
reg_code="${reg_raw##*$'\n'}"
reg_body="${reg_raw%$'\n'*}"

if [[ "$reg_code" == "200" ]] && echo "$reg_body" | grep -q '"access_token"'; then
  GA_ACCESS_TOKEN="$(echo "$reg_body" | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)"
  GA_AUTH_SOURCE="register"
  return 0 2>/dev/null || exit 0
fi

if [[ "$reg_code" == "429" ]]; then
  GA_REGISTER_RATE_LIMITED=1
fi

GA_ACCESS_TOKEN=""
GA_AUTH_SOURCE=""
return 1 2>/dev/null || exit 1
