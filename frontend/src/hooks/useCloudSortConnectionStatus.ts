import { useCallback, useEffect, useRef, useState } from "react";
import type { EntitlementStatus } from "../api";
import { desktopClient } from "../desktopClient";
import { isSubscribedCloudSortAccount } from "../utils/cloudSortActive";
import { hasEntitlementIpc } from "../utils/electronDesktop";

export type CloudSortConnectionStatus =
  | "checking"
  | "connecting"
  | "connected"
  | "unavailable"
  | "offline";

const PROBE_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("timeout"));
    }, ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Probes cloud sort readiness once per signed-in session. Triggers credential sync at most once
 * (main process enforces cooldown on repeated failures).
 */
export function useCloudSortConnectionStatus(opts: {
  enabled: boolean;
  backendOnline: boolean;
  entitlement: EntitlementStatus | null | undefined;
}): CloudSortConnectionStatus {
  const { enabled, backendOnline, entitlement } = opts;
  const cloudLoggedIn = Boolean(entitlement?.cloudLoggedIn);
  const [status, setStatus] = useState<CloudSortConnectionStatus>("checking");
  const attemptRef = useRef(0);
  const syncedRef = useRef(false);

  const probeReady = useCallback(async (): Promise<boolean> => {
    try {
      const res = await withTimeout(desktopClient.fetch("/ready"), PROBE_TIMEOUT_MS);
      const body = (await res.json()) as {
        checks?: { ollama?: { ok?: boolean } };
      };
      return Boolean(body.checks?.ollama?.ok);
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus("checking");
      syncedRef.current = false;
      return;
    }
    if (!backendOnline) {
      setStatus("offline");
      return;
    }
    if (!cloudLoggedIn) {
      setStatus("checking");
      syncedRef.current = false;
      return;
    }

    const expiresAt = entitlement?.sortCredentialsExpiresAt;
    const nearExpiry =
      expiresAt != null && Date.now() >= Number(expiresAt) - 5 * 60 * 1000;
    if (nearExpiry) {
      syncedRef.current = false;
    }

    const attemptId = attemptRef.current + 1;
    attemptRef.current = attemptId;

    void (async () => {
      setStatus("connecting");

      try {
        const canSync =
          !syncedRef.current &&
          hasEntitlementIpc() &&
          isSubscribedCloudSortAccount(entitlement) &&
          typeof window.electronAPI?.syncSortCredentials === "function";

        if (canSync) {
          syncedRef.current = true;
          await withTimeout(
            window.electronAPI!.syncSortCredentials!(),
            PROBE_TIMEOUT_MS + 4_000,
          );
        }

        if (attemptRef.current !== attemptId) return;

        const ok = await probeReady();
        if (attemptRef.current !== attemptId) return;
        setStatus(ok ? "connected" : "unavailable");
      } catch {
        if (attemptRef.current === attemptId) {
          setStatus("unavailable");
        }
      }
    })();
  }, [enabled, backendOnline, cloudLoggedIn, entitlement, probeReady]);

  return status;
}
