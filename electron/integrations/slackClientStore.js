/**
 * Secure storage for the user's Slack OAuth app credentials (client id + secret).
 *
 * Lets users paste credentials from api.slack.com in the setup guide instead of
 * editing `.env`. Uses Electron safeStorage when available.
 */

const path = require("path");
const fs = require("fs");
const { app, safeStorage } = require("electron");

const ENC_FILE = "slack-oauth-client.enc";
const PLAIN_FALLBACK_FILE = "slack-oauth-client.b64";

function clientFilePath(suffix) {
  return path.join(require("../accountProfile").resolveProfileRoot(), suffix);
}

/**
 * @param {{ clientId: string; clientSecret: string }} creds
 * @returns {{ ok: true } | { ok: false; reason: string }}
 */
function saveSlackOAuthClient(creds) {
  const clientId = typeof creds?.clientId === "string" ? creds.clientId.trim() : "";
  const clientSecret = typeof creds?.clientSecret === "string" ? creds.clientSecret.trim() : "";
  if (!clientId || !clientSecret) {
    return { ok: false, reason: "missing_client_id_or_secret" };
  }
  const payload = JSON.stringify({ client_id: clientId, client_secret: clientSecret });
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, reason: "encryption_unavailable" };
    }
    fs.writeFileSync(clientFilePath(ENC_FILE), safeStorage.encryptString(payload));
    try {
      fs.unlinkSync(clientFilePath(PLAIN_FALLBACK_FILE));
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @returns {{ clientId: string; clientSecret: string } | null}
 */
function loadSlackOAuthClient() {
  try {
    // M2.7: wipe legacy plaintext leftover; never read it.
    try {
      fs.unlinkSync(clientFilePath(PLAIN_FALLBACK_FILE));
    } catch {
      /* ignore */
    }
    if (!safeStorage.isEncryptionAvailable()) return null;
    const encPath = clientFilePath(ENC_FILE);
    if (!fs.existsSync(encPath)) return null;
    const raw = safeStorage.decryptString(fs.readFileSync(encPath));
    const parsed = JSON.parse(raw);
    const clientId = typeof parsed?.client_id === "string" ? parsed.client_id.trim() : "";
    const clientSecret = typeof parsed?.client_secret === "string" ? parsed.client_secret.trim() : "";
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  } catch {
    return null;
  }
}

/**
 * @returns {{ ok: boolean }}
 */
function clearSlackOAuthClient() {
  let cleared = false;
  try {
    fs.unlinkSync(clientFilePath(ENC_FILE));
    cleared = true;
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(clientFilePath(PLAIN_FALLBACK_FILE));
    cleared = true;
  } catch {
    /* ignore */
  }
  return { ok: cleared };
}

module.exports = {
  saveSlackOAuthClient,
  loadSlackOAuthClient,
  clearSlackOAuthClient,
};
