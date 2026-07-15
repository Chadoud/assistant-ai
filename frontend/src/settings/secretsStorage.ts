/**
 * Persist sensitive settings keys via Electron safeStorage when available.
 * API keys are never written to localStorage (see settingsPersist.ts).
 * Packaged builds return a mask from getSecret — treat mask as "configured, unchanged".
 */

import type { AppSettings } from "../types/settings";

const SECRET_KEY_GEMINI = "geminiApiKey";
const PROVIDER_KEY_PREFIX = "chatProvider.";
/** Must match electron/ipc/secretsHandlers.js SECRET_MASK */
const SECRET_MASK = "••••••••";

function providerSecretStorageKey(providerId: string): string {
  return `${PROVIDER_KEY_PREFIX}${providerId}.apiKey`;
}

async function readSecret(key: string): Promise<string | null> {
  const api = window.electronAPI;
  if (!api?.getSecret) return null;
  try {
    const value = await api.getSecret(key);
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

async function writeSecret(key: string, value: string): Promise<boolean> {
  const api = window.electronAPI;
  if (!api?.setSecret || !value.trim()) return false;
  if (value.trim() === SECRET_MASK) return true;
  try {
    const result = await api.setSecret(key, value.trim());
    return Boolean(result && typeof result === "object" && "ok" in result && result.ok);
  } catch {
    return false;
  }
}

/** Load provider API keys from safeStorage and merge into settings on hydrate. */
export async function hydrateSecretsFromSafeStorage(): Promise<Partial<AppSettings>> {
  const gemini = await readSecret(SECRET_KEY_GEMINI);
  const chatProviders: AppSettings["chatProviders"] = {};
  for (const providerId of ["gemini", "openai", "anthropic", "custom"] as const) {
    const apiKey = await readSecret(providerSecretStorageKey(providerId));
    if (apiKey) {
      chatProviders[providerId] = { apiKey, model: "" };
    }
  }
  const patch: Partial<AppSettings> = {};
  if (gemini) patch.geminiApiKey = gemini;
  if (Object.keys(chatProviders).length > 0) {
    patch.chatProviders = chatProviders;
  }
  return patch;
}

/** Mirror all provider keys to safeStorage when settings change (Electron only). */
export async function persistProviderSecretsToSafeStorage(settings: AppSettings): Promise<void> {
  const geminiKey = settings.geminiApiKey?.trim() || settings.chatProviders?.gemini?.apiKey?.trim() || "";
  if (geminiKey && geminiKey !== SECRET_MASK) {
    await writeSecret(SECRET_KEY_GEMINI, geminiKey);
  }
  for (const [providerId, cfg] of Object.entries(settings.chatProviders ?? {})) {
    const apiKey = cfg?.apiKey?.trim();
    if (apiKey && apiKey !== SECRET_MASK) {
      await writeSecret(providerSecretStorageKey(providerId), apiKey);
    }
  }
}

export { SECRET_MASK };
