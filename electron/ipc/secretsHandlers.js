/** IPC handlers for main-process safeStorage secrets (P5-5.2.2). */

const { ipcMain } = require("electron");
const { getSecret, setSecret, hasSecret } = require("../secretsStore");
const { isTrustedSender } = require("./senderGuard");

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
}

module.exports = { registerSecretsHandlers, SECRET_MASK };
