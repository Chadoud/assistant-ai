/**
 * Persist sensitive settings keys via Electron safeStorage when available.
 * API keys are never written to localStorage (see settingsPersist.ts).
 * Packaged builds return a mask from getSecret — treat mask as "configured, unchanged".
 * Never persist the mask string as a real secret (setSecret no-ops on mask).
 * UI readiness must use isGeminiConnectedInSettings, not format checks alone.
 */

import type { AppSettings } from "../types/settings";
import { GEMINI_SECRET_MASK } from "../utils/geminiConnection";

const SECRET_KEY_GEMINI = "geminiApiKey";
const PROVIDER_KEY_PREFIX = "chatProvider.";
/** Same string as electron/ipc/secretsHandlers.js SECRET_MASK (CI-enforced). */
const SECRET_MASK = GEMINI_SECRET_MASK;

const PROVIDER_IDS = ["gemini", "openai", "anthropic", "custom"] as const;

/** Bumped on account-profile remount so in-flight persists cannot write into the next vault. */
let vaultPersistGeneration = 0;

export function beginVaultSecretsRemount(): number {
  vaultPersistGeneration += 1;
  return vaultPersistGeneration;
}

export function getVaultPersistGeneration(): number {
  return vaultPersistGeneration;
}

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

async function removeSecret(key: string): Promise<void> {
  const api = window.electronAPI;
  if (!api?.clearSecret) return;
  try {
    await api.clearSecret(key);
  } catch {
    /* ignore */
  }
}

/** Empty provider keys used while remounting so UI cannot keep prior vault material. */
export function blankProviderSecretSettings(
  prev: AppSettings,
): Pick<AppSettings, "geminiApiKey" | "chatProviders"> {
  const chatProviders = { ...(prev.chatProviders || {}) };
  for (const id of PROVIDER_IDS) {
    chatProviders[id] = {
      ...(chatProviders[id] || { model: "" }),
      apiKey: "",
    };
  }
  return { geminiApiKey: "", chatProviders };
}

/** Load provider API keys from safeStorage and merge into settings on hydrate. */
export async function hydrateSecretsFromSafeStorage(): Promise<Partial<AppSettings>> {
  const gemini = await readSecret(SECRET_KEY_GEMINI);
  const chatProviders: AppSettings["chatProviders"] = {};
  for (const providerId of PROVIDER_IDS) {
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

/**
 * Mirror provider keys to safeStorage when settings change (Electron only).
 * Empty keys clear the active vault blob so logout/switch cannot leave prior keys on disk.
 * @param generation When set, no-op if a newer vault remount started (cancels in-flight writes).
 */
export async function persistProviderSecretsToSafeStorage(
  settings: AppSettings,
  generation?: number,
): Promise<void> {
  if (generation != null && generation !== vaultPersistGeneration) return;

  const geminiKey = settings.geminiApiKey?.trim() || settings.chatProviders?.gemini?.apiKey?.trim() || "";
  if (geminiKey && geminiKey !== SECRET_MASK) {
    await writeSecret(SECRET_KEY_GEMINI, geminiKey);
  } else if (!geminiKey) {
    await removeSecret(SECRET_KEY_GEMINI);
  }
  if (generation != null && generation !== vaultPersistGeneration) return;

  for (const providerId of PROVIDER_IDS) {
    if (generation != null && generation !== vaultPersistGeneration) return;
    const apiKey = settings.chatProviders?.[providerId]?.apiKey?.trim() || "";
    const key = providerSecretStorageKey(providerId);
    if (apiKey && apiKey !== SECRET_MASK) {
      await writeSecret(key, apiKey);
    } else if (!apiKey) {
      await removeSecret(key);
    }
  }
}
