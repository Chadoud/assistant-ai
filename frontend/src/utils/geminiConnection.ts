/**
 * Single user-facing Gemini connection check for chat and voice.
 * Settings / safeStorage is the source of truth — never backend/.env alone.
 */

import type { AppSettings } from "../types/settings";
import { isGeminiApiKeyConfigured } from "./geminiApiKey";
import { resolveGeminiApiKeyFromSettings } from "./syncGeminiKeyToBackend";

/** Must match electron/ipc/secretsHandlers.js and secretsStorage.ts */
export const GEMINI_SECRET_MASK = "••••••••";

/**
 * True when the user has connected Gemini in the app (Settings / safeStorage).
 * Packaged builds hydrate a mask instead of the raw key — that still counts as connected.
 */
export function isGeminiConnectedInSettings(settings: AppSettings): boolean {
  if (isGeminiApiKeyConfigured(resolveGeminiApiKeyFromSettings(settings))) {
    return true;
  }
  const raw =
    settings.geminiApiKey?.trim() ||
    settings.chatProviders?.gemini?.apiKey?.trim() ||
    "";
  return raw === GEMINI_SECRET_MASK;
}
