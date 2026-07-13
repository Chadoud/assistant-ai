/**
 * Authenticate a voice WebSocket without putting the app token in the URL.
 * Must be the first JSON frame sent after the socket opens.
 */

import { getAppToken } from "../api/client";

/** Send the per-run backend token as the first post-open JSON frame. */
export async function sendVoiceWsAppAuth(ws: WebSocket): Promise<void> {
  const token = await getAppToken();
  if (!token || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "app_auth", token }));
}
