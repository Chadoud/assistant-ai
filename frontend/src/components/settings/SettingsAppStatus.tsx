import { useMemo } from "react";
import type { EntitlementStatus } from "../../api";
import { useI18n } from "../../i18n/I18nContext";
import { useCloudSortActive } from "../../hooks/useCloudSortActive";
import { useRefreshSortConnection } from "../../hooks/useRefreshSortConnection";
import { hasEntitlementIpc } from "../../utils/electronDesktop";
import { CARD_SHELL_CLASS } from "../../utils/styles";

interface SettingsAppStatusProps {
  backendOnline: boolean;
  backendHealthProbing: boolean;
  modelCount: number;
  loadingModels: boolean;
  entitlement?: EntitlementStatus | null;
  onRetryBackend?: () => void;
  onEntitlementRefresh?: () => void | Promise<void>;
}

function StatusRow({
  label,
  status,
  detail,
  action,
}: {
  label: string;
  status: "ok" | "warn" | "error" | "loading";
  detail: string;
  action?: React.ReactNode;
}) {
  const dot =
    status === "ok"
      ? "bg-success"
      : status === "warn"
        ? "bg-warning"
        : status === "error"
          ? "bg-error"
          : "bg-muted animate-pulse";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
        <div>
          <p className="text-sm font-medium text-text-primary">{label}</p>
          <p className="text-xs text-muted leading-snug mt-0.5">{detail}</p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * Compact app status for About & help — no Tesseract language dump.
 */
export default function SettingsAppStatus({
  backendOnline,
  backendHealthProbing,
  modelCount,
  loadingModels,
  entitlement,
  onRetryBackend,
  onEntitlementRefresh,
}: SettingsAppStatusProps) {
  const { t } = useI18n();
  const { cloudSortActive, loading: cloudSortLoading } = useCloudSortActive(entitlement);
  const { refreshSortConnection, sortRefreshBusy } = useRefreshSortConnection(onEntitlementRefresh);

  const localService = useMemo(() => {
    if (backendHealthProbing) {
      return { status: "loading" as const, detail: t("api.settingsChecking") };
    }
    if (backendOnline) {
      return { status: "ok" as const, detail: t("settings.appStatus.localReady") };
    }
    return { status: "error" as const, detail: t("settings.appStatus.localOffline") };
  }, [backendHealthProbing, backendOnline, t]);

  const sortService = useMemo(() => {
    if (loadingModels || cloudSortLoading) {
      return { status: "loading" as const, detail: t("systemStatus.checking") };
    }
    if (cloudSortActive) {
      const syncError = entitlement?.sortSyncLastError?.trim();
      if (syncError) {
        return {
          status: "error" as const,
          detail: t("queue.cloudSortSyncFailedBanner"),
        };
      }
      if (entitlement?.sortServiceConfigured === false) {
        return {
          status: "warn" as const,
          detail: t("sortService.connectingShort"),
        };
      }
      return { status: "ok" as const, detail: t("settings.appStatus.sortCloud") };
    }
    if (modelCount > 0) {
      return {
        status: "ok" as const,
        detail:
          modelCount === 1
            ? t("systemStatus.modelsInstalledOne")
            : t("systemStatus.modelsInstalled", { count: modelCount }),
      };
    }
    return { status: "warn" as const, detail: t("settings.appStatus.sortNeedsModel") };
  }, [cloudSortActive, cloudSortLoading, entitlement, loadingModels, modelCount, t]);

  return (
    <div id="system-status" className={`${CARD_SHELL_CLASS} divide-y divide-border px-4 pt-3 scroll-mt-24`}>
      <StatusRow
        label={t("settings.appStatus.localService")}
        status={localService.status}
        detail={localService.detail}
        action={
          !backendOnline && onRetryBackend ? (
            <button
              type="button"
              onClick={onRetryBackend}
              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-hover-overlay"
            >
              {t("settings.appStatus.retry")}
            </button>
          ) : null
        }
      />
      <StatusRow
        label={t("settings.appStatus.sortService")}
        status={sortService.status}
        detail={sortService.detail}
        action={
          cloudSortActive &&
          entitlement?.cloudLoggedIn &&
          hasEntitlementIpc() &&
          typeof window.electronAPI?.syncSortCredentials === "function" &&
          sortService.status !== "ok"
            ? (
              <button
                type="button"
                disabled={sortRefreshBusy || !backendOnline}
                onClick={() => void refreshSortConnection()}
                className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-hover-overlay disabled:opacity-40"
              >
                {sortRefreshBusy ? t("sortService.connectingShort") : t("settings.appStatus.sortRefresh")}
              </button>
            )
            : null
        }
      />
      <p className="py-3 text-2xs text-muted leading-relaxed">{t("settings.appStatus.footer")}</p>
    </div>
  );
}
