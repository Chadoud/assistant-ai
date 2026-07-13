import type { AppSettings } from "../../types/settings";
import { SECTION_LABEL_CLASS } from "../../utils/styles";
import { useI18n } from "../../i18n/I18nContext";

interface OutputFolderSectionProps {
  local: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
}

export default function OutputFolderSection({ local, update }: OutputFolderSectionProps) {
  const { t } = useI18n();
  const handleBrowse = async () => {
    const dir = await window.electronAPI?.openDirectory?.({
      title: t("settings.outputFolder.dialogTitle"),
      defaultPath: local.outputDir.trim() || undefined,
      buttonLabel: t("settings.outputFolder.dialogButton"),
    });
    if (dir) update({ outputDir: dir });
  };

  return (
    <div data-tour="settings-output-folder">
      <label className={SECTION_LABEL_CLASS}>{t("settings.outputFolder.label")}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={local.outputDir}
          onChange={(e) => update({ outputDir: e.target.value })}
          placeholder={t("settings.outputFolder.placeholder")}
          className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent placeholder:text-muted"
        />
        <button
          onClick={handleBrowse}
          className="px-3 py-2 rounded-lg bg-bg-secondary border border-border text-muted hover:text-text-primary hover:border-accent transition-colors text-sm"
        >
          {t("settings.outputFolder.browse")}
        </button>
      </div>
      <p className="text-xs text-muted mt-2">{t("settings.outputFolder.hint")}</p>
    </div>
  );
}
