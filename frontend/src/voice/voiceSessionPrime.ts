/**
 * Prime a voice session before opening the WebSocket.
 * Electron: main process relays OAuth tokens + provider keys over HTTP (not renderer WS).
 */

import { request } from "../api/client";
import type { AppSettings } from "../types/settings";
import { resolveChatProviderCredentials } from "../utils/resolveChatProviderCredentials";

export interface VoicePrimePayload {
  sessionId: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
}

/**
 * Relay integration tokens and provider context to the backend for one voice session.
 */
export async function primeVoiceSessionFromRenderer(
  sessionId: string,
  settings?: AppSettings,
): Promise<{ ok: boolean; reason?: string }> {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, reason: "session_id_required" };

  const routing = settings ? resolveChatProviderCredentials(settings) : undefined;
  const payload: VoicePrimePayload = {
    sessionId: sid,
    provider: routing?.provider,
    model: routing?.model,
    baseUrl: routing?.baseUrl,
  };

  const api = window.electronAPI;
  if (api && typeof api.voicePrimeSession === "function") {
    const result = await api.voicePrimeSession(payload);
    if (result && typeof result === "object" && "ok" in result) {
      return result.ok
        ? { ok: true }
        : { ok: false, reason: String((result as { reason?: string }).reason || "prime_failed") };
    }
    return { ok: false, reason: "prime_failed" };
  }

  try {
    await request("/voice/session-prime", {
      method: "POST",
      body: JSON.stringify({
        session_id: sid,
        provider: routing?.provider || "gemini",
        model: routing?.model || "",
        api_key: routing?.provider === "ollama" ? "" : routing?.apiKey || "",
        base_url: routing?.provider === "custom" ? routing?.baseUrl || "" : "",
      }),
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
