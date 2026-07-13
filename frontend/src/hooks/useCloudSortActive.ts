import { useMemo } from "react";
import type { EntitlementStatus } from "../api";
import { hasEntitlementIpc } from "../utils/electronDesktop";
import { useRemoteLlmMode } from "./useRemoteLlmMode";
import { computeCloudSortActive } from "../utils/cloudSortActive";

/**
 * True when file sorting runs on Exo cloud infrastructure (not local Ollama).
 * Uses entitlement IPC when available; falls back to persisted backend env overrides.
 */
export function useCloudSortActive(entitlement?: EntitlementStatus | null): {
  cloudSortActive: boolean;
  loading: boolean;
  credentialsManaged: boolean;
} {
  const { remote, loading: remoteLoading } = useRemoteLlmMode();

  const desktopApp = hasEntitlementIpc();

  return useMemo(
    () =>
      computeCloudSortActive({
        entitlement,
        remoteFromOverrides: remote,
        overridesLoading: remoteLoading,
        desktopApp,
      }),
    [entitlement, remote, remoteLoading, desktopApp]
  );
}
