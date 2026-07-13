/**
 * SettingsMemorySection — memory toggle, clear-all, and link to Memory tab.
 */

import { useState } from "react";
import type { AppSettings } from "../../types/settings";
import { clearAllMemory } from "../../api/memory";
import { useI18n } from "../../i18n/I18nContext";

interface Props {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  backendOnline: boolean;
  onOpenMemoriesTab?: () => void;
}

export default function SettingsMemorySection({
  settings,
  onSettingsPatch,
  backendOnline,
  onOpenMemoriesTab,
}: Props) {
  const { t } = useI18n();
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    if (!backendOnline) return;
    setClearing(true);
    setError(null);
    try {
      await clearAllMemory();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("memories.loadFailed"));
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{t("settings.aiMemoryGroupTitle")}</h3>
          <p className="mt-0.5 text-xs text-muted">{t("settings.aiMemoryGroupDesc")}</p>
        </div>
        <button
          role="switch"
          aria-checked={settings.assistantMemoryEnabled}
          onClick={() => onSettingsPatch({ assistantMemoryEnabled: !settings.assistantMemoryEnabled })}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
            settings.assistantMemoryEnabled ? "bg-accent" : "bg-border"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              settings.assistantMemoryEnabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {settings.assistantMemoryEnabled ? (
        <div className="space-y-3 rounded-xl border border-border bg-bg-secondary p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-text-primary">{t("settings.brainMapIncludeMailTitle")}</p>
              <p className="mt-0.5 text-xs text-muted">{t("settings.brainMapIncludeMailDesc")}</p>
            </div>
            <button
              role="switch"
              aria-checked={settings.brainMapIncludeMailTasks}
              onClick={() =>
                onSettingsPatch({ brainMapIncludeMailTasks: !settings.brainMapIncludeMailTasks })
              }
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                settings.brainMapIncludeMailTasks ? "bg-accent" : "bg-border"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  settings.brainMapIncludeMailTasks ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {onOpenMemoriesTab ? (
            <button
              type="button"
              onClick={onOpenMemoriesTab}
              className="text-sm font-medium text-accent hover:underline"
            >
              {t("memories.settingsManageLink")} →
            </button>
          ) : null}

          {error ? (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleClearAll()}
              disabled={clearing || !backendOnline}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                confirmClear
                  ? "bg-red-600 text-white hover:bg-red-500"
                  : "border border-border text-text-secondary hover:text-red-400"
              }`}
            >
              {confirmClear ? t("settings.confirmClearMemory") : t("settings.clearAllMemory")}
            </button>
            {confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-text-primary"
              >
                {t("memories.cancel")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
