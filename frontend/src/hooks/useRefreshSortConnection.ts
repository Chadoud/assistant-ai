import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "../i18n/I18nContext";

/**
 * Re-sync cloud sort credentials (LiteLLM virtual key + worker URL) from the signed-in account.
 */
export function useRefreshSortConnection(onEntitlementRefresh?: () => void | Promise<void>) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  const refreshSortConnection = useCallback(async () => {
    const sync = window.electronAPI?.syncSortCredentials;
    if (!sync) {
      toast.message(t("settings.appStatus.sortRefreshDesktopOnly"));
      return false;
    }
    setBusy(true);
    try {
      const result = await sync({ force: true });
      if (result?.ok) {
        if (result.restarted) {
          toast.success(t("settings.appStatus.sortRefreshApplied"));
        } else {
          toast.success(t("settings.appStatus.sortRefreshOk"));
        }
        await onEntitlementRefresh?.();
        return true;
      }
      toast.error(t("settings.appStatus.sortRefreshFailed"), {
        description: result?.error?.trim() || t("queue.cloudSortSyncFailedBanner"),
      });
      return false;
    } catch (err) {
      toast.error(t("settings.appStatus.sortRefreshFailed"), {
        description: err instanceof Error ? err.message : undefined,
      });
      return false;
    } finally {
      setBusy(false);
    }
  }, [onEntitlementRefresh, t]);

  return { refreshSortConnection, sortRefreshBusy: busy };
}
