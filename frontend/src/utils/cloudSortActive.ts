import type { EntitlementStatus } from "../api";

export type CloudSortActiveInput = {
  entitlement?: EntitlementStatus | null;
  remoteFromOverrides: boolean;
  overridesLoading: boolean;
  /** Desktop app with entitlement IPC — signed-in cloud accounts use server-side sort UI. */
  desktopApp?: boolean;
};

/** Signed-in Exo cloud subscriber entitled to sort. */
export function isSubscribedCloudSortAccount(
  entitlement?: EntitlementStatus | null,
): boolean {
  return (
    Boolean(entitlement?.cloudAuthRequired) &&
    Boolean(entitlement?.cloudLoggedIn) &&
    entitlement?.canAnalyze !== false
  );
}

/** Pure helper — exported for unit tests. */
export function computeCloudSortActive(input: CloudSortActiveInput): {
  cloudSortActive: boolean;
  loading: boolean;
  credentialsManaged: boolean;
} {
  const { entitlement, remoteFromOverrides, overridesLoading, desktopApp } = input;
  const fromEntitlement =
    entitlement?.sortServiceMode === "cloud" || entitlement?.sortCredentialsManaged === true;
  const fromOverrides = remoteFromOverrides && !overridesLoading;
  const fromSubscribedAccount =
    Boolean(desktopApp) && isSubscribedCloudSortAccount(entitlement);
  const cloudSortActive = fromEntitlement || fromOverrides || fromSubscribedAccount;
  const loading = overridesLoading && entitlement == null;
  return {
    cloudSortActive,
    loading,
    credentialsManaged: entitlement?.sortCredentialsManaged === true,
  };
}
