import type { EntitlementStatus } from "../api";
import { useI18n } from "../i18n/I18nContext";
import { openPrimarySettingsSection } from "../utils/settingsNav";

const TRIAL_WARNING_DAYS = 3;

interface TrialEndingBannerProps {
  entitlement: EntitlementStatus | null;
  onOpenTrialSettings: () => void;
}

/**
 * Subtle reminder when the free trial is close to ending — not a blocking modal.
 */
export default function TrialEndingBanner({ entitlement, onOpenTrialSettings }: TrialEndingBannerProps) {
  const { t } = useI18n();

  if (!entitlement || entitlement.licensed || entitlement.unlimitedBuild || !entitlement.trialActive) {
    return null;
  }
  if (entitlement.trialDaysRemaining > TRIAL_WARNING_DAYS) {
    return null;
  }

  return (
    <div
      className="border-b border-warning-line bg-warning-soft/80 px-4 py-2 text-center text-xs text-text-primary"
      role="status"
    >
      <span>{t("trial.endingSoon", { days: entitlement.trialDaysRemaining })}</span>{" "}
      <button
        type="button"
        onClick={onOpenTrialSettings}
        className="font-semibold text-accent underline-offset-2 hover:underline"
      >
        {t("trial.openSettings")}
      </button>
    </div>
  );
}

/** Opens Settings → Trial & license. */
export function openTrialSettings(jumpToSettings: (id: string) => void): void {
  openPrimarySettingsSection(jumpToSettings, { section: "license" });
}
