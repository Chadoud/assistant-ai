/**
 * Strip secret fields before persisting settings to localStorage (ADR-006).
 */

import type { AppSettings, ChatProviderConfig } from "../types/settings";

/** Settings safe to store in renderer localStorage — no API keys. */
export function stripSecretsForStorage(settings: AppSettings): AppSettings {
  const chatProviders: Record<string, ChatProviderConfig> = {};
  for (const [providerId, cfg] of Object.entries(settings.chatProviders ?? {})) {
    chatProviders[providerId] = {
      ...cfg,
      apiKey: "",
    };
  }
  return {
    ...settings,
    geminiApiKey: "",
    chatProviders,
  };
}
