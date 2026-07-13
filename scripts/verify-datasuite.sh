#!/usr/bin/env bash
# Extended DataSuite smoke test (health, auth gate, optional authenticated API checks).
set -euo pipefail

BASE="${DATASUITE_URL:-https://datasuite.exosites.ch}"
COOKIE_JAR="${TMPDIR:-/tmp}/datasuite-verify-cookies.txt"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

fail() { echo -e "${RED}$*${NC}" >&2; exit 1; }
ok() { echo -e "${GREEN}$*${NC}"; }
warn() { echo -e "${YELLOW}$*${NC}"; }

echo "Checking ${BASE}/api/health.php …"
HEALTH=$(curl -fsS "${BASE}/api/health.php" || fail "health unreachable")
echo "$HEALTH" | grep -q '"ok":true' || fail "health ok:false"
echo "$HEALTH" | grep -q '"db":true' || fail "db:false — check YOUR_IK_ID_datasuite creds + migrations"

echo "Checking auth gate on overview …"
CODE=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}/api/overview.php" || fail "overview request failed")
[[ "$CODE" == "401" ]] || fail "overview should return 401 without session (got ${CODE})"

echo "Checking login page …"
LOGIN=$(curl -fsS "${BASE}/login.php" || fail "login page unreachable")
echo "$LOGIN" | grep -q 'DataSuite' || fail "login page missing title"
echo "$LOGIN" | grep -q 'favicon.svg' || fail "login page missing favicon link"

PASS="${DATASUITE_ADMIN_PASSWORD:-}"
if [[ -z "$PASS" && -f "$(dirname "$0")/../datasuite/.env.server" ]]; then
  warn "Set DATASUITE_ADMIN_PASSWORD for authenticated API checks (optional)."
elif [[ -n "$PASS" ]]; then
  echo "Checking authenticated overview + trends …"
  rm -f "$COOKIE_JAR"
  curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "${BASE}/login.php" \
    -d "password=${PASS}" -o /dev/null -w "" || fail "login POST failed"
  OVERVIEW=$(curl -fsS -b "$COOKIE_JAR" "${BASE}/api/overview.php?days=30" || fail "overview authed failed")
  echo "$OVERVIEW" | grep -q '"headline"' || fail "overview missing headline"
  echo "$OVERVIEW" | grep -q '"period_days":30' || fail "overview missing period_days"
  TRENDS=$(curl -fsS -b "$COOKIE_JAR" "${BASE}/api/trends.php?days=30" || fail "trends authed failed")
  echo "$TRENDS" | grep -q 'signed_in_vs_anonymous' || fail "trends missing sign-in mix (migration 007?)"
  PRODUCT=$(curl -fsS -b "$COOKIE_JAR" "${BASE}/api/product.php?days=30" || fail "product authed failed")
  echo "$PRODUCT" | grep -q '"priorities"' || fail "product missing priorities (migration 013?)"
  rm -f "$COOKIE_JAR"
fi

ok "DataSuite smoke OK on ${BASE}"
