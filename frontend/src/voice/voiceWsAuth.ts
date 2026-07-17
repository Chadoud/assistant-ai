/**
 * Authenticate a voice WebSocket without putting the durable app token in the renderer.
 * Must be the first JSON frame sent after the socket opens.
 */

/** Send a short-lived voice WS ticket as the first post-open JSON frame (M2.3). */
export async function sendVoiceWsAppAuth(ws: WebSocket): Promise<{ ok: boolean; reason?: string }> {
  if (ws.readyState !== WebSocket.OPEN) {
    return { ok: false, reason: "socket_not_open" };
  }
  const mint = window.electronAPI?.voiceMintWsAuthTicket;
  if (typeof mint !== "function") {
    return { ok: false, reason: "mint_unavailable" };
  }
  try {
    const res = await mint();
    if (!res || res.ok !== true || !res.ticket) {
      const reason =
        res && res.ok === false && res.reason ? String(res.reason) : "ws_ticket_failed";
      return { ok: false, reason };
    }
    ws.send(JSON.stringify({ type: "app_auth", token: res.ticket }));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
