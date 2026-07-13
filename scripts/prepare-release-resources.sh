#!/usr/bin/env bash
# Stage bundled resources required for production DMG/EXE builds.
# Merges connector OAuth keys from backend/.env into integration-config.json (see sync script).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RES="$ROOT/electron/resources"
mkdir -p "$RES"

RELEASE_ENV="$ROOT/.env.release"
if [[ -f "$RELEASE_ENV" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$RELEASE_ENV"
  set +a
fi

INTEGRATION="$RES/integration-config.json"
if [[ ! -f "$INTEGRATION" ]]; then
  cp "$RES/integration-config.json.example" "$INTEGRATION"
  echo "[prepare-release-resources] Created $INTEGRATION from example"
fi

# OAuth client IDs for Dropbox, Microsoft, Notion, etc. — from backend/.env or CI env vars.
node "$ROOT/scripts/sync-integration-config-release-env.js"

# Optional CI secret: base64-encoded Desktop OAuth client JSON for Gmail connect.
if [[ -n "${GMAIL_OAUTH_CLIENT_JSON_B64:-}" ]]; then
  echo "$GMAIL_OAUTH_CLIENT_JSON_B64" | base64 -d > "$RES/gmail_oauth_client.json"
  echo "[prepare-release-resources] Wrote gmail_oauth_client.json from GMAIL_OAUTH_CLIENT_JSON_B64"
elif [[ -f "$ROOT/backend/.env" ]]; then
  if node "$ROOT/scripts/sync-gmail-oauth-release-env.js"; then
    echo "[prepare-release-resources] Wrote gmail_oauth_client.json from backend/.env"
  fi
fi

if [[ ! -f "$RES/gmail_oauth_client.json" ]]; then
  echo "[prepare-release-resources] No gmail_oauth_client.json — Gmail/Google connect disabled in this build"
  if [[ "${STRICT_RELEASE:-0}" == "1" ]]; then
    echo "[prepare-release-resources] ERROR: STRICT_RELEASE requires gmail_oauth_client.json (GitHub secret GMAIL_OAUTH_CLIENT_JSON_B64 or backend/.env)" >&2
    exit 1
  fi
fi

if [[ ! -f "$RES/integration-config.json" ]]; then
  echo "[prepare-release-resources] ERROR: missing integration-config.json" >&2
  exit 1
fi

echo "[prepare-release-resources] OK"
