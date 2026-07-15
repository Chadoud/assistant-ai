/**
 * Authenticate a voice WebSocket without putting the durable app token in the renderer.
 * Must be the first JSON frame sent after the socket opens.
 */

/** Send a short-lived voice WS ticket as the first post-open JSON frame (M2.3). */
export async function sendVoiceWsAppAuth(ws: WebSocket): Promise<void> {
  if (ws.readyState !== WebSocket.OPEN) return;
  const mint = window.electronAPI?.voiceMintWsAuthTicket;
  if (typeof mint !== "function") return;
  try {
    const res = await mint();
    if (!res?.ok || !res.ticket) return;
    ws.send(JSON.stringify({ type: "app_auth", token: res.ticket }));
  } catch {
    /* auth failure closes the socket server-side */
  }
}
