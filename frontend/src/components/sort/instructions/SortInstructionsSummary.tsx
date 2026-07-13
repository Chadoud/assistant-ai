import type { AppSettings } from "../../../types/settings";
import { buildSortInstructionsSummary } from "./buildSortInstructionsSummary";
import { useI18n } from "../../../i18n/I18nContext";

interface SortInstructionsSummaryProps {
  settings: AppSettings;
}

/** One-line outcome summary for the next sort run. */
export function SortInstructionsSummary({ settings }: SortInstructionsSummaryProps) {
  const { t } = useI18n();
  const summary = buildSortInstructionsSummary(settings, t);
  return (
    <p className="text-2xs text-muted leading-relaxed pt-1" aria-live="polite">
      <span className="font-medium text-text-secondary">{t("sortInstructionsStrip.summaryPrefix")}</span>{" "}
      {summary}
    </p>
  );
}
