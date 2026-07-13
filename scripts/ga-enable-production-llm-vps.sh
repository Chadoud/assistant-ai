#!/usr/bin/env bash
# Rsync LLM infra and enable llm.exosites.ch TLS alias on the VPS.
# Requires DNS A record for llm.exosites.ch first (see npm run ga:prep-production-llm).
#
# Usage: ./scripts/ga-enable-production-llm-vps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_DOMAIN="${PROD_LLM_DOMAIN:-llm.exosites.ch}"

prod_ip="$(dig +short "${PROD_DOMAIN}" A @8.8.8.8 2>/dev/null | head -1)"
if [[ -z "$prod_ip" ]]; then
  echo "DNS not ready: ${PROD_DOMAIN} has no A record."
  echo "Create the A record in Infomaniak, then re-run."
  npm run ga:prep-production-llm
  exit 1
fi

# Patch Caddyfile on VPS to include production alias (staging .env keeps DOMAIN=llm-staging…)
VPS_SSH="${VPS_SSH:-}"
VPS_SSH_KEY="${VPS_SSH_KEY:-}"

"${ROOT}/scripts/package-llm-ga-to-vps.sh"

ssh -i "$VPS_SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "$VPS_SSH" \
  "cd ~/exo-llm && \
   grep -q '${PROD_DOMAIN}' caddy/Caddyfile || sed -i 's/{\$DOMAIN} {/{\$DOMAIN}, ${PROD_DOMAIN} {/' caddy/Caddyfile && \
   chmod +x scripts/*.sh && ./scripts/enable-production-llm-alias.sh"

echo ""
echo "Verify production:"
curl -fsS "https://${PROD_DOMAIN}/health/liveliness" && echo ""
SORT_CREDENTIALS_BASE="https://${PROD_DOMAIN}" "${ROOT}/scripts/verify-sort-ga-readiness.sh" | tail -8
