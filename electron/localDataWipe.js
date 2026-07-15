/**
 * Delete local Electron userData artifacts after backend wipe.
 */

const fs = require("fs");
const path = require("path");

const WIPE_FILES = [
  "sync_prefs.json",
  "sync_master_key.enc",
  "sync_runs.jsonl",
  "renderer-diagnostics.log",
  "telemetry-offline-queue.json",
  "backend-env-overrides.json",
  "gmail_oauth.json",
  "integration_accounts_v1.json",
  "entitlement.json",
  "trial.json",
  "sort_credentials_meta.json",
  "cloud_session_prefs.json",
  "cloud_session.json",
  // M2.7 leftovers (encrypted + legacy plaintext)
  "notion-oauth-client.enc",
  "notion-oauth-client.b64",
  "slack-oauth-client.enc",
  "slack-oauth-client.b64",
  "infomaniak-api-token.enc",
  "infomaniak-api-token.b64",
];

/**
 * @param {string} userData
 * @returns {{ ok: true; removed: string[] } | { ok: false; reason: string }}
 */
function wipeElectronUserDataFiles(userData) {
  if (!userData || typeof userData !== "string") {
    return { ok: false, reason: "invalid_user_data" };
  }
  const removed = [];
  for (const name of WIPE_FILES) {
    const target = path.join(userData, name);
    try {
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
        removed.push(name);
      }
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }
  const secretsDir = path.join(userData, "settings_secrets_v1");
  try {
    if (fs.existsSync(secretsDir)) {
      fs.rmSync(secretsDir, { recursive: true, force: true });
      removed.push("settings_secrets_v1/");
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true, removed };
}

module.exports = { wipeElectronUserDataFiles, WIPE_FILES };
