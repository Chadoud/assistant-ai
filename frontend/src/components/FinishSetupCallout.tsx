import type { EntitlementStatus } from "../api";
import { useI18n } from "../i18n/I18nContext";
import { useCloudSortActive } from "../hooks/useCloudSortActive";

interface FinishSetupCalloutProps {
  /** Re-opens the welcome wizard at the point the user can pick a model. */
  onFinishSetup: () => void;
  entitlement?: EntitlementStatus | null;
}

/**
 * Persistent call-to-action when first-run setup was skipped before sorting can work.
 */
export default function FinishSetupCallout({ onFinishSetup, entitlement }: FinishSetupCalloutProps) {
  const { t } = useI18n();
  const { cloudSortActive } = useCloudSortActive(entitlement);

  return (
    <div
      className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 max-w-[calc(100vw-2rem)]"
      role="status"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-bg-card/95 px-4 py-2.5 shadow-xl backdrop-blur">
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
        </span>
        <p className="min-w-0 text-sm text-text-primary leading-snug">
          {t(cloudSortActive ? "welcome.finishSetupBodyCloud" : "welcome.finishSetupBody")}
        </p>
        <button
          type="button"
          onClick={onFinishSetup}
          className="shrink-0 rounded-xl bg-button-primary px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90"
        >
          {t("welcome.finishSetupAction")}
        </button>
      </div>
    </div>
  );
}
