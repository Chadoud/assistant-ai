/** Voice session priming IPC — tokens relayed from main over HTTP, not renderer WebSocket. */

const { ipcMain } = require("electron");
const { isTrustedSender } = require("./senderGuard");
const { primeVoiceSessionFromMain } = require("../voiceSessionPrime");

function registerVoiceHandlers() {
  ipcMain.handle("voice:primeSession", async (event, payload) => {
    if (!isTrustedSender(event)) {
      return { ok: false, reason: "untrusted_sender" };
    }
    try {
      return await primeVoiceSessionFromMain(payload || {});
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  });
}

module.exports = { registerVoiceHandlers };
