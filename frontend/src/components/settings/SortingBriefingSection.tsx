import type { AppSettings } from "../../types/settings";
import { SECTION_LABEL_CLASS } from "../../utils/styles";
import { useI18n } from "../../i18n/I18nContext";

/**
 * Per-job default for the optional filing briefing LLM (maps to ``document_briefing_enable`` on the API).
 */
export default function SortingBriefingSection({
  settings,
  onSettingsPatch,
}: {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
}) {
  const { t } = useI18n();
  const value =
    settings.documentBriefingEnable === null
      ? "default"
      : settings.documentBriefingEnable
        ? "on"
        : "off";

  return (
    <div data-tour="settings-document-briefing" className="space-y-2">
      <label htmlFor="document-briefing-select" className={SECTION_LABEL_CLASS}>
        {t("settings.documentBriefingTitle")}
      </label>
      <p className="text-xs text-muted leading-relaxed">{t("settings.documentBriefingHint")}</p>
      <select
        id="document-briefing-select"
        className="w-full max-w-md rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onSettingsPatch({
            documentBriefingEnable: v === "default" ? null : v === "on",
          });
        }}
      >
        <option value="default">{t("settings.documentBriefingDefault")}</option>
        <option value="on">{t("settings.documentBriefingOn")}</option>
        <option value="off">{t("settings.documentBriefingOff")}</option>
      </select>
    </div>
  );
}
