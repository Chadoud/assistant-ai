import { desktopClient } from "../desktopClient";
import type { AppSettings, ChatProviderId } from "../types/settings";
import { isGeminiApiKeyConfigured, normalizeGeminiApiKey } from "./geminiApiKey";

/**
 * Resolve the Gemini API key from settings — prefers chatProviders.gemini, then legacy geminiApiKey.
 */
export function resolveGeminiApiKeyFromSettings(settings: AppSettings): string {
  const candidates = [
    settings.chatProviders?.gemini?.apiKey,
    settings.geminiApiKey,
  ];
  for (const raw of candidates) {
    const normalized = normalizeGeminiApiKey(raw);
    if (isGeminiApiKeyConfigured(normalized)) return normalized;
  }
  return "";
}

/** Raw key for the setup UI — normalized for editing, including invalid stored values. */
export function resolveGeminiApiKeyDraftFromSettings(settings: AppSettings): string {
  const raw = settings.geminiApiKey || settings.chatProviders?.gemini?.apiKey || "";
  const normalized = normalizeGeminiApiKey(raw);
  return normalized || String(raw).trim();
}

/** Push a provider key (and optional base URL) to the backend env/.env. */
export async function pushProviderKeyToBackend(
  providerId: ChatProviderId,
  apiKey: string,
  baseUrl: string,
): Promise<void> {
  await desktopClient.postAiSetKey({
    provider: providerId,
    api_key: apiKey,
    base_url: baseUrl,
  });
}

/**
 * Sync the configured Gemini key to the backend so voice and other env-based paths work.
 * Voice reads GEMINI_API_KEY from the backend process — not per-request credentials like chat.
 */
export async function syncGeminiKeyToBackend(settings: AppSettings): Promise<boolean> {
  const apiKey = resolveGeminiApiKeyFromSettings(settings);
  if (!apiKey) return false;
  await pushProviderKeyToBackend("gemini", apiKey, "");
  return true;
}
