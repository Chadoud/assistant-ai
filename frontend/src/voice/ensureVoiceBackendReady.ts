import { desktopClient } from "../desktopClient";
import type { AppSettings } from "../types/settings";
import { resolveGeminiApiKeyFromSettings, syncGeminiKeyToBackend } from "../utils/syncGeminiKeyToBackend";

type VoiceBackendReadyResult =
  | { ready: true; model: string }
  | { ready: false; reason: "missing_key" | "sync_failed" | "backend_not_ready" | "offline" };

/**
 * Sync Gemini credentials to the backend env and verify /voice/status before opening a session.
 */
async function readVoiceBackendStatus(): Promise<VoiceBackendReadyResult | null> {
  try {
    const body = await desktopClient.getVoiceStatus();
    if (body?.ready) {
      return { ready: true, model: typeof body.model === "string" ? body.model : "" };
    }
    return null;
  } catch {
    return null;
  }
}

export async function ensureVoiceBackendReady(
  settings: AppSettings,
  options?: { backendOnline?: boolean },
): Promise<VoiceBackendReadyResult> {
  if (options?.backendOnline === false) {
    return { ready: false, reason: "offline" };
  }

  const alreadyReady = await readVoiceBackendStatus();
  if (alreadyReady?.ready) {
    return alreadyReady;
  }

  const apiKey = resolveGeminiApiKeyFromSettings(settings);
  if (!apiKey) {
    return { ready: false, reason: "missing_key" };
  }

  try {
    const synced = await syncGeminiKeyToBackend(settings);
    if (!synced) {
      return { ready: false, reason: "sync_failed" };
    }
  } catch {
    const recovered = await readVoiceBackendStatus();
    if (recovered?.ready) {
      return recovered;
    }
    return { ready: false, reason: "sync_failed" };
  }

  const afterSync = await readVoiceBackendStatus();
  if (afterSync?.ready) {
    return afterSync;
  }
  return { ready: false, reason: "backend_not_ready" };
}

export function voiceBackendNotReadyMessage(result: VoiceBackendReadyResult): string {
  if (result.ready) return "";
  switch (result.reason) {
    case "missing_key":
      return "Gemini API key is missing. Add it in Settings → AI agents → AI provider.";
    case "sync_failed":
      return "Couldn't connect to the voice service. Check your Gemini key in Settings → AI agents → AI provider.";
    case "backend_not_ready":
      return "Voice isn't ready yet. Check your Gemini key in Settings → AI agents → AI provider.";
    case "offline":
      return "Exo is still starting on this computer — try again in a moment.";
    default:
      return "Voice isn't available right now.";
  }
}

/**
 * Sync credentials and verify voice readiness; throws with user-facing copy on failure.
 */
export async function assertVoiceBackendReady(
  settings: AppSettings,
  options?: { backendOnline?: boolean },
): Promise<{ model: string }> {
  const result = await ensureVoiceBackendReady(settings, options);
  if (!result.ready) {
    throw new Error(voiceBackendNotReadyMessage(result));
  }
  return { model: result.model };
}
