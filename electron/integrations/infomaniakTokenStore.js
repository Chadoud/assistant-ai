/**
 * Secure storage for the user's Infomaniak personal API token.
 *
 * Uses Electron safeStorage (OS keychain / DPAPI / libsecret) when available,
 * with a graceful fallback for environments where encryption is unavailable.
 *
 * The token is never logged or sent to any external service beyond the
 * Infomaniak API itself.
 */

const path = require("path");
const fs = require("fs");
const { app, safeStorage } = require("electron");

const ENC_FILE = "infomaniak-api-token.enc";
const PLAIN_FALLBACK_FILE = "infomaniak-api-token.b64";

function tokenFilePath(suffix) {
  return path.join(app.getPath("userData"), suffix);
}

/**
 * Persist the personal API token to disk, encrypted with the OS keychain when
 * safeStorage is available.
 *
 * @param {string} token - The raw Bearer token string.
 * @returns {Promise<{ ok: true } | { ok: false; reason: string }>}
 */
async function saveInfomaniakApiToken(token) {
  if (typeof token !== "string" || !token.trim()) {
    return { ok: false, reason: "empty_token" };
  }
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, reason: "encryption_unavailable" };
    }
    fs.writeFileSync(tokenFilePath(ENC_FILE), safeStorage.encryptString(token.trim()));
    try {
      fs.unlinkSync(tokenFilePath(PLAIN_FALLBACK_FILE));
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Load the stored personal API token from disk.
 *
 * @returns {string | null} The token string, or null if none is stored.
 */
function loadInfomaniakApiToken() {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encPath = tokenFilePath(ENC_FILE);
      if (!fs.existsSync(encPath)) return null;
      const buf = fs.readFileSync(encPath);
      return safeStorage.decryptString(buf) || null;
    }
    const fallbackPath = tokenFilePath(PLAIN_FALLBACK_FILE);
    if (!fs.existsSync(fallbackPath)) return null;
    const encoded = fs.readFileSync(fallbackPath, "utf8").trim();
    return Buffer.from(encoded, "base64").toString("utf8") || null;
  } catch {
    return null;
  }
}

/**
 * Remove the stored token from disk.
 *
 * @returns {{ ok: boolean }}
 */
function clearInfomaniakApiToken() {
  let cleared = false;
  try { fs.unlinkSync(tokenFilePath(ENC_FILE)); cleared = true; } catch { /* ignore */ }
  try { fs.unlinkSync(tokenFilePath(PLAIN_FALLBACK_FILE)); cleared = true; } catch { /* ignore */ }
  return { ok: cleared };
}

/**
 * Returns true if the given string looks like a plausible Infomaniak API token
 * (non-empty, reasonable length, no whitespace).
 *
 * @param {string | null | undefined} token
 * @returns {boolean}
 */
function isValidInfomaniakApiToken(token) {
  return typeof token === "string" && token.trim().length >= 20 && !/\s/.test(token.trim());
}

module.exports = {
  saveInfomaniakApiToken,
  loadInfomaniakApiToken,
  clearInfomaniakApiToken,
  isValidInfomaniakApiToken,
};
