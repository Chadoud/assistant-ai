/** Voice session priming IPC — tokens relayed from main over HTTP, not renderer WebSocket. */

const { ipcMain } = require("electron");
const { isTrustedSender } = require("./senderGuard");
const { primeVoiceSessionFromMain } = require("../voiceSessionPrime");
const { backendFetch } = require("../backendHttp");

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

  /** Short-lived WS auth ticket — not the durable app token (M2.3). */
  ipcMain.handle("voice:mintWsAuthTicket", async (event) => {
    if (!isTrustedSender(event)) {
      return { ok: false, reason: "untrusted_sender" };
    }
    try {
      const res = await backendFetch("/voice/ws-ticket", { method: "POST", body: {} });
      const ticket =
        res.data && typeof res.data === "object" && typeof res.data.ticket === "string"
          ? res.data.ticket
          : "";
      if (!res.ok || !ticket) {
        return {
          ok: false,
          reason:
            (res.data && typeof res.data === "object" && res.data.detail) ||
            `ws_ticket_failed_${res.status}`,
        };
      }
      return { ok: true, ticket };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  });
}

module.exports = { registerVoiceHandlers };
