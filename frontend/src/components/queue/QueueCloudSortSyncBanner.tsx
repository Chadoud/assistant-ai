import { useI18n } from "../../i18n/I18nContext";
import { useRefreshSortConnection } from "../../hooks/useRefreshSortConnection";

type QueueCloudSortSyncBannerProps = {
  errorMessage: string;
  backendOnline: boolean;
  onEntitlementRefresh?: () => void | Promise<void>;
};

/** Shown when cloud sort credentials failed to sync — offer refresh, not a trip to account settings. */
export function QueueCloudSortSyncBanner({
  errorMessage,
  backendOnline,
  onEntitlementRefresh,
}: QueueCloudSortSyncBannerProps) {
  const { t } = useI18n();
  const { refreshSortConnection, sortRefreshBusy } = useRefreshSortConnection(onEntitlementRefresh);

  return (
    <div
      role="alert"
      aria-label={`${t("queue.cloudSortSyncFailedAria")}: ${t("queue.cloudSortSyncFailedBanner")}`}
      className="rounded-xl border border-warning-line bg-warning-soft p-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <svg
            className="w-5 h-5 text-warning shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <div className="min-w-0">
            <p className="text-sm text-warning leading-snug m-0">{t("queue.cloudSortSyncFailedBanner")}</p>
            {errorMessage ? (
              <p className="text-xs text-warning/80 leading-snug mt-1 m-0 truncate" title={errorMessage}>
                {errorMessage}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          disabled={!backendOnline || sortRefreshBusy}
          onClick={() => void refreshSortConnection()}
          className="shrink-0 self-start sm:self-center text-sm font-medium px-3 py-1.5 rounded-lg border border-warning-line bg-bg-card text-text-primary hover:bg-hover-overlay disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
        >
          {sortRefreshBusy ? t("sortService.connectingShort") : t("settings.appStatus.sortRefresh")}
        </button>
      </div>
    </div>
  );
}
