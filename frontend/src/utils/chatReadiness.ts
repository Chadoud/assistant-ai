import type { AppSettings } from "../types/settings";
import { isGeminiApiKeyConfigured } from "./geminiApiKey";
import { resolveGeminiApiKeyFromSettings } from "./syncGeminiKeyToBackend";

type ChatBlockReason = "gemini";

/**
 * Chat uses Gemini cloud — ready when a key is configured.
 * The local app service is optional for basic chat; required only for files, sort, and integrations.
 */
export function isChatReady(settings: AppSettings): boolean {
  return isGeminiApiKeyConfigured(resolveGeminiApiKeyFromSettings(settings));
}

/** Why the composer is blocked — null when the user can send messages. */
export function getChatBlockReason(settings: AppSettings): ChatBlockReason | null {
  if (!isChatReady(settings)) return "gemini";
  return null;
}
