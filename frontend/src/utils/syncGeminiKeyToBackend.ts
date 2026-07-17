import { desktopClient } from "../desktopClient";
import type { AppSettings, ChatProviderId } from "../types/settings";
import { apiKeyForBackendRequest, resolveGeminiApiKeyRaw } from "./geminiConnection";
import { normalizeGeminiApiKey } from "./geminiApiKey";

/**
 * Resolve the Gemini API key from settings — prefers chatProviders.gemini, then legacy geminiApiKey.
 * Returns "" for mask-only (packaged) or unset — use isGeminiConnectedInSettings for readiness.
 */
export function resolveGeminiApiKeyFromSettings(settings: AppSettings): string {
  return resolveGeminiApiKeyRaw(settings);
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
  const key = apiKeyForBackendRequest(apiKey);
  if (!key && providerId !== "ollama") return;
  await desktopClient.postAiSetKey({
    provider: providerId,
    api_key: key,
    base_url: baseUrl,
  });
}

/**
 * Sync the configured Gemini key to the backend so voice and other env-based paths work.
 * Voice reads GEMINI_API_KEY from the backend process — not per-request credentials like chat.
 * No-op when only the packaged mask is present (spawn already injected the real key).
 */
export async function syncGeminiKeyToBackend(settings: AppSettings): Promise<boolean> {
  const apiKey = resolveGeminiApiKeyRaw(settings);
  if (!apiKey) return false;
  await pushProviderKeyToBackend("gemini", apiKey, "");
  return true;
}
