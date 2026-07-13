import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { EntitlementStatus } from "../api";
import type { UiLocale } from "../i18n/locale";
import { translate } from "../i18n/translate";
import { hasEntitlementIpc, isElectronRenderer } from "../utils/electronDesktop";
import { toastUserError } from "../utils/userGuidance";

function gateFallbackEntitlement(): EntitlementStatus {
  return {
    trialActive: false,
    trialStartedAt: null,
    trialEndsAt: null,
    trialDaysRemaining: 0,
    trialExpired: true,
    licensed: false,
    licenseReason: null,
    canAnalyze: false,
    canUseProactive: false,
    canUseSync: false,
    hasLicenseKey: false,
    cloudAuthRequired: true,
    cloudLoggedIn: false,
    cloudEmail: null,
    cloudFirstName: null,
    cloudLastName: null,
  };
}

/** Pure gate logic — exported for unit tests. */
export function computeNeedsCloudAccount(
  entitlementLoaded: boolean,
  entitlement: EntitlementStatus | null,
  hasIpc: boolean,
  isElectron: boolean
): boolean {
  if (!entitlementLoaded) return false;
  if (isElectron && !hasIpc) return true;
  return Boolean(
    hasIpc && !entitlement?.cloudLoggedIn && entitlement?.cloudAuthRequired !== false
  );
}

/** Desktop: IPC `entitlement:getState`; browser dev: `GET /entitlement/status`. */
export function useEntitlement(uiLocale: UiLocale) {
  const [entitlement, setEntitlement] = useState<EntitlementStatus | null>(null);
  const [entitlementLoaded, setEntitlementLoaded] = useState(false);
  const hasLoadedRef = useRef(false);

  const refreshEntitlementWithStatus = useCallback(async (): Promise<EntitlementStatus | null> => {
    const useIpc = hasEntitlementIpc();
    try {
      const result = useIpc
        ? await window.electronAPI!.getEntitlementState!()
        : await api.entitlementStatus();
      hasLoadedRef.current = true;
      setEntitlementLoaded(true);
      setEntitlement(result);
      return result;
    } catch (e) {
      setEntitlementLoaded(true);
      const fallback = useIpc ? gateFallbackEntitlement() : null;
      setEntitlement(fallback);
      if (hasLoadedRef.current) {
        toastUserError(translate(uiLocale, "userErrors.licenseCheckFailed"), e);
      }
      return fallback;
    }
  }, [uiLocale]);

  const refreshEntitlement = useCallback(async (): Promise<void> => {
    await refreshEntitlementWithStatus();
  }, [refreshEntitlementWithStatus]);

  useEffect(() => {
    void refreshEntitlement();
  }, [refreshEntitlement]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onCloudSessionChanged) return;
    return api.onCloudSessionChanged(() => {
      void refreshEntitlement();
    });
  }, [refreshEntitlement]);

  const needsCloudAccount = useMemo(
    () =>
      computeNeedsCloudAccount(
        entitlementLoaded,
        entitlement,
        hasEntitlementIpc(),
        isElectronRenderer()
      ),
    [entitlementLoaded, entitlement]
  );

  const mainAppReady = entitlementLoaded && !needsCloudAccount;

  return { entitlement, entitlementLoaded, refreshEntitlement, refreshEntitlementWithStatus, needsCloudAccount, mainAppReady };
}
