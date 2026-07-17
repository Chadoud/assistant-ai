/** IPC handlers for main-process safeStorage secrets (P5-5.2.2). */

const { ipcMain } = require("electron");
const { getSecret, setSecret, hasSecret, clearSecret } = require("../secretsStore");
const { isTrustedSender } = require("./senderGuard");

// Must stay identical to GEMINI_SECRET_MASK in frontend/src/utils/geminiConnection.ts
// (enforced by scripts/verify-security-posture.mjs). Do not invent a second mask string.
const SECRET_MASK = "••••••••";

function registerSecretsHandlers() {
  ipcMain.handle("secrets:has", async (event, key) => {
    if (!isTrustedSender(event)) return false;
    if (typeof hasSecret === "function") return Boolean(hasSecret(key));
    const v = getSecret(key);
    return typeof v === "string" && v.length > 0;
  });

  ipcMain.handle("secrets:get", async (event, key) => {
    if (!isTrustedSender(event)) return null;
    // Never return raw secret material to the renderer (M2.3 / XSS blast radius).
    const v = getSecret(key);
    return typeof v === "string" && v.length > 0 ? SECRET_MASK : null;
  });

  ipcMain.handle("secrets:set", async (event, key, value) => {
    if (!isTrustedSender(event)) {
      return { ok: false, reason: "untrusted_sender" };
    }
    if (typeof value === "string" && value.trim() === SECRET_MASK) {
      return { ok: true, skipped: true };
    }
    return setSecret(key, value);
  });

  ipcMain.handle("secrets:clear", async (event, key) => {
    if (!isTrustedSender(event)) {
      return { ok: false, reason: "untrusted_sender" };
    }
    return clearSecret(key);
  });
}

module.exports = { registerSecretsHandlers, SECRET_MASK };
