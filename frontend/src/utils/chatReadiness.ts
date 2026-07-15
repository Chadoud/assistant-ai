import type { AppSettings } from "../types/settings";
import { isGeminiConnectedInSettings } from "./geminiConnection";

type ChatBlockReason = "gemini";

/**
 * Chat uses Gemini cloud — ready when Settings / safeStorage has a key
 * (same gate as voice; see geminiConnection.ts).
 */
export function isChatReady(settings: AppSettings): boolean {
  return isGeminiConnectedInSettings(settings);
}

/** Why the composer is blocked — null when the user can send messages. */
export function getChatBlockReason(settings: AppSettings): ChatBlockReason | null {
  if (!isChatReady(settings)) return "gemini";
  return null;
}
