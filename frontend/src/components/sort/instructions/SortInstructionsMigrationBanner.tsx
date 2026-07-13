import type { AppSettings } from "../../../types/settings";
import { useI18n } from "../../../i18n/I18nContext";
import {
  dismissLegacyDualSortConfig,
  hasLegacyDualSortConfig,
  isLegacyDualSortConfigDismissed,
} from "../../../utils/legacyDualSortConfig";
import { useState } from "react";

interface SortInstructionsMigrationBannerProps {
  settings: AppSettings;
}

/** One-time hint when structure mode won over a saved custom prompt (legacy dual config). */
export function SortInstructionsMigrationBanner({ settings }: SortInstructionsMigrationBannerProps) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(isLegacyDualSortConfigDismissed);

  if (dismissed || !hasLegacyDualSortConfig(settings)) return null;

  return (
    <div
      role="status"
      className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-2xs text-text-secondary leading-relaxed flex flex-wrap items-start justify-between gap-2"
    >
      <p>{t("sortInstructionsStrip.migrationDualConfig")}</p>
      <button
        type="button"
        className="shrink-0 font-medium text-accent hover:underline"
        onClick={() => {
          dismissLegacyDualSortConfig();
          setDismissed(true);
        }}
      >
        {t("sortInstructionsStrip.migrationDismiss")}
      </button>
    </div>
  );
}
