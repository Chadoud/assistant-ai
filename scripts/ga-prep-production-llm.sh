#!/usr/bin/env bash
# Prep checklist for production LLM host llm.exosites.ch (copy of staging layout).
#
# Usage: ./scripts/ga-prep-production-llm.sh
#   DRY_RUN=1 ./scripts/ga-prep-production-llm.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_SSH="${VPS_SSH:-}"
PROD_DOMAIN="${PROD_LLM_DOMAIN:-llm.exosites.ch}"
STAGING_DOMAIN="${STAGING_LLM_DOMAIN:-llm-staging.exosites.ch}"

echo "Production LLM prep — ${PROD_DOMAIN}"
echo ""
echo "1. DNS: A record ${PROD_DOMAIN} → VPS IPv4 (same as ${STAGING_DOMAIN})"
staging_ip="$(dig +short "${STAGING_DOMAIN}" A @8.8.8.8 2>/dev/null | head -1)"
prod_ip="$(dig +short "${PROD_DOMAIN}" A @8.8.8.8 2>/dev/null | head -1)"
if [[ -n "$prod_ip" ]]; then
  echo "   DNS status: ${PROD_DOMAIN} → ${prod_ip}"
else
  echo "   DNS status: ${PROD_DOMAIN} → NXDOMAIN (create A record → ${staging_ip:-VPS IPv4})"
fi
echo "2. Infomaniak Cloud Server firewall: TCP 80 + 443 open"
echo "3. On VPS ~/exo-llm/.env set:"
echo "     DOMAIN=${PROD_DOMAIN}"
echo "     ACME_EMAIL=<your email>"
echo "4. After DNS propagates, enable TLS alias on VPS:"
echo "     npm run ga:enable-production-llm"
echo "5. Update desktop packaging:"
echo "     electron/resources/integration-config.json"
echo "       EXOSITES_SORT_CREDENTIALS_URL=https://${PROD_DOMAIN}"
echo "     electron/cloudAuth.js PACKAGED_SORT_CREDENTIALS_URL (when cutting GA build)"
echo "6. Optional Infomaniak api.exosites.ch:"
echo "     SORT_LLM_BASE_URL=https://${PROD_DOMAIN}"
echo ""
echo "Verify:"
echo "  curl -fsS https://${PROD_DOMAIN}/health/liveliness"
echo "  SORT_CREDENTIALS_BASE=https://${PROD_DOMAIN} ./scripts/verify-sort-ga-readiness.sh"
echo ""
if [[ "${DRY_RUN:-0}" != "1" ]]; then
  echo "Current staging:"
  curl -fsS "https://${STAGING_DOMAIN}/health/liveliness" 2>/dev/null && echo " (staging OK)" || echo " (staging unreachable)"
  code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 8 "https://${PROD_DOMAIN}/health/liveliness" 2>/dev/null || echo "000")
  echo "Production ${PROD_DOMAIN}: HTTP ${code}"
fi
