import { useCallback, useEffect, useState } from "react";
import { hasElectronBridge } from "../utils/platform";

export type WhatsAppConnectConfig = {
  embeddedSignupAvailable: boolean;
  loading: boolean;
  cloudSignedIn: boolean | null;
  reason?: string;
  refresh: () => Promise<void>;
};

/** Load Meta Embedded Signup availability from cloud-node via Electron IPC. */
export function useWhatsAppConnectConfig(active = true): WhatsAppConnectConfig {
  const [state, setState] = useState<Omit<WhatsAppConnectConfig, "refresh">>({
    embeddedSignupAvailable: false,
    loading: true,
    cloudSignedIn: null,
  });

  const refresh = useCallback(async () => {
    if (!active) return;
    if (!hasElectronBridge() || !window.electronAPI?.integrationGetWhatsAppConnectConfig) {
      setState({
        embeddedSignupAvailable: false,
        loading: false,
        cloudSignedIn: null,
        reason: "desktop_bridge_unavailable",
      });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    try {
      let cloudSignedIn: boolean | null = null;
      if (window.electronAPI.getEntitlementState) {
        const ent = await window.electronAPI.getEntitlementState();
        cloudSignedIn = ent?.cloudLoggedIn === true;
      }
      const res = await window.electronAPI.integrationGetWhatsAppConnectConfig();
      setState({
        embeddedSignupAvailable: Boolean(res?.embedded_signup_available),
        loading: false,
        cloudSignedIn,
        reason: res?.ok ? undefined : res?.reason,
      });
    } catch (err) {
      setState({
        embeddedSignupAvailable: false,
        loading: false,
        cloudSignedIn: null,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active, refresh]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!active || !api?.onCloudSessionChanged) return;
    return api.onCloudSessionChanged(() => {
      void refresh();
    });
  }, [active, refresh]);

  return { ...state, refresh };
}
