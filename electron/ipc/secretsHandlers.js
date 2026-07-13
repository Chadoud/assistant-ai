/** IPC handlers for main-process safeStorage secrets (P5-5.2.2). */

const { ipcMain } = require("electron");
const { getSecret, setSecret } = require("../secretsStore");
const { isTrustedSender } = require("./senderGuard");

function registerSecretsHandlers() {
  ipcMain.handle("secrets:get", async (event, key) => {
    if (!isTrustedSender(event)) return null;
    return getSecret(key);
  });

  ipcMain.handle("secrets:set", async (event, key, value) => {
    if (!isTrustedSender(event)) {
      return { ok: false, reason: "untrusted_sender" };
    }
    return setSecret(key, value);
  });
}

module.exports = { registerSecretsHandlers };
