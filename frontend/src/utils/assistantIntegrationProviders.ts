import type { AppSettings } from "../types/settings";
import type { AssistantIntegrationProviderKey } from "../systemCommands/catalog/types";
import { hasElectronBridge } from "./platform";

/** Integration IDs that share the Microsoft Graph session. */
export const MS_GRAPH_PROVIDER_IDS = ["microsoft", "onedrive", "outlook"] as const;

export const GOOGLE_INTEGRATION_PROVIDER_IDS = [
  "google-gmail",
  "google-drive",
  "google-calendar",
] as const;

export const INFOMANIAK_INTEGRATION_PROVIDER_IDS = [
  "infomaniak",
  "infomaniak-mail",
  "infomaniak-calendar",
] as const;

const PROVIDER_FAMILY_IDS: Record<AssistantIntegrationProviderKey, readonly string[]> = {
  microsoft: MS_GRAPH_PROVIDER_IDS,
  google: GOOGLE_INTEGRATION_PROVIDER_IDS,
  infomaniak: INFOMANIAK_INTEGRATION_PROVIDER_IDS,
};

/** True when any account in the family is connected in External Sources. */
export function isAssistantIntegrationProviderConnected(
  provider: AssistantIntegrationProviderKey,
  connectedIds: Set<string>
): boolean {
  return PROVIDER_FAMILY_IDS[provider].some((id) => connectedIds.has(id));
}

/**
 * Whether assistant tools for a provider family may run.
 * When connection state is known, External Sources is the source of truth.
 */
export function isAssistantIntegrationProviderEnabled(
  provider: AssistantIntegrationProviderKey,
  settings: AppSettings,
  connectedIntegrationIds: Set<string> | null | undefined
): boolean {
  if (connectedIntegrationIds) {
    return isAssistantIntegrationProviderConnected(provider, connectedIntegrationIds);
  }
  switch (provider) {
    case "microsoft":
      return settings.assistantToolsProviderMicrosoft;
    case "google":
      return settings.assistantToolsProviderGoogle;
    case "infomaniak":
      return settings.assistantToolsProviderInfomaniak;
  }
}

/**
 * Load External Sources connection flags from the desktop shell.
 * Returns null when the bridge is unavailable.
 */
export async function loadConnectedIntegrationIds(): Promise<Set<string> | null> {
  if (!hasElectronBridge() || typeof window.electronAPI?.integrationGetAccounts !== "function") {
    return null;
  }
  try {
    const res = await window.electronAPI.integrationGetAccounts();
    if (!res?.ok || !Array.isArray(res.accounts)) return null;
    return new Set(res.accounts.filter((a) => a.connected).map((a) => a.providerId));
  } catch {
    return null;
  }
}
