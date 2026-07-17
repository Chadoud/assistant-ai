/**
 * Gemini / provider connection helpers for Settings, chat, and voice.
 *
 * Contract:
 * - **Format** (`isGeminiKeyFormatPlausible`) — paste/save only
 * - **Connected** (`isGeminiConnectedInSettings`) — banners, badges, chat/voice gates
 * - **Backend request** (`apiKeyForBackendRequest` / `resolveGeminiApiKeyRaw`) — never send the mask
 *
 * Packaged Electron hydrates `••••••••` from safeStorage instead of the raw key.
 * That still counts as connected; spawn already injects the real key into the backend.
 *
 * Do not use format checks for UI readiness.
 */

import type { AppSettings, ChatProviderId } from "../types/settings";
import { isGeminiKeyFormatPlausible, normalizeGeminiApiKey } from "./geminiApiKey";

/**
 * Packaged safeStorage placeholder returned by Electron ``secrets:get``.
 * Must stay identical to ``SECRET_MASK`` in ``electron/ipc/secretsHandlers.js``
 * (enforced by ``scripts/verify-security-posture.mjs``).
 */
export const GEMINI_SECRET_MASK = "••••••••";

export function isSecretMask(value: string | undefined | null): boolean {
  return (value ?? "").trim() === GEMINI_SECRET_MASK;
}

/** Strip UI mask so backend falls back to spawn-injected env keys (M2.3). */
export function apiKeyForBackendRequest(apiKey: string | undefined | null): string {
  const raw = (apiKey || "").trim();
  if (!raw || isSecretMask(raw)) return "";
  return raw;
}

/**
 * True when a provider key field is present (raw key or packaged mask).
 * Use for Configured badges on OpenAI / Anthropic / Custom / Gemini cards.
 */
export function isProviderApiKeyPresent(apiKey: string | undefined | null): boolean {
  const raw = (apiKey ?? "").trim();
  if (!raw) return false;
  if (isSecretMask(raw)) return true;
  return raw.length > 0;
}

/**
 * Raw Gemini key from settings when format-plausible; "" for mask-only or unset.
 * Prefer chatProviders.gemini, then legacy geminiApiKey.
 */
export function resolveGeminiApiKeyRaw(settings: AppSettings): string {
  const candidates = [
    settings.chatProviders?.gemini?.apiKey,
    settings.geminiApiKey,
  ];
  for (const raw of candidates) {
    if (isSecretMask(raw)) continue;
    const normalized = normalizeGeminiApiKey(raw);
    if (isGeminiKeyFormatPlausible(normalized)) return normalized;
  }
  return "";
}

/**
 * True when the user has connected Gemini in the app (Settings / safeStorage).
 * Packaged builds hydrate a mask instead of the raw key — that still counts as connected.
 */
export function isGeminiConnectedInSettings(settings: AppSettings): boolean {
  if (resolveGeminiApiKeyRaw(settings)) return true;
  const raw =
    settings.geminiApiKey?.trim() ||
    settings.chatProviders?.gemini?.apiKey?.trim() ||
    "";
  return isSecretMask(raw);
}

/** Provider key for UI presence (Gemini uses dual legacy fields). */
export function resolveProviderApiKeyForPresence(
  settings: AppSettings,
  providerId: ChatProviderId,
): string {
  if (providerId === "gemini") {
    return (
      settings.chatProviders?.gemini?.apiKey?.trim() ||
      settings.geminiApiKey?.trim() ||
      ""
    );
  }
  return settings.chatProviders?.[providerId]?.apiKey?.trim() || "";
}
