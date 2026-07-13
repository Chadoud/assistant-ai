import type { EntitlementStatus } from "../api";

/** Session cache — updated from entitlement IPC so sync helpers (Drive debug logs) see admin status. */
let productDebugCached = import.meta.env.DEV;

/**
 * Keep module-level cache in sync with the signed-in cloud account (Electron IPC).
 */
export function setProductDebugAccessCached(enabled: boolean): void {
  productDebugCached = import.meta.env.DEV || enabled;
}

/**
 * Product admins get the same diagnostics surface as local dev builds:
 * assistant snapshot export, sort infra controls, verbose errors, sort AI traces.
 */
export function canUseProductDebug(entitlement?: EntitlementStatus | null): boolean {
  if (import.meta.env.DEV) return true;
  if (entitlement?.isProductAdmin) return true;
  return productDebugCached;
}

/** Sync read — use after {@link setProductDebugAccessCached} ran from app shell entitlement. */
export function isProductDebugEnabled(): boolean {
  return canUseProductDebug(null);
}

/**
 * Assistant chat debug footer (snapshot export, voice traces).
 * In dev builds, respects {@link AppSettings.assistantDebugUiEnabled}; production product admins are unchanged.
 */
export function shouldShowAssistantDebugUi(
  productDebugEnabled: boolean,
  assistantDebugUiEnabled: boolean,
): boolean {
  if (!productDebugEnabled) return false;
  if (!import.meta.env.DEV) return true;
  return assistantDebugUiEnabled;
}
