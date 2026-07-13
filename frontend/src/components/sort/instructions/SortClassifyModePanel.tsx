import { useId } from "react";
import type { AppSettings } from "../../../types/settings";
import { resolveSortClassifyMode } from "../../../utils/inferSortClassifyMode";
import { useI18n } from "../../../i18n/I18nContext";
import { SortStructureModePanel } from "./panels/SortStructureModePanel";
import { SortCustomModePanel } from "./panels/SortCustomModePanel";

interface SortClassifyModePanelProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  backendOnline: boolean;
}

/** Inline panel for Structure or Custom grouping modes. */
export function SortClassifyModePanel({
  settings,
  onSettingsPatch,
  backendOnline,
}: SortClassifyModePanelProps) {
  const { t } = useI18n();
  const panelId = useId();
  const mode = resolveSortClassifyMode(settings);

  if (mode === "builtin") return null;

  return (
    <div
      id={panelId}
      role="region"
      aria-label={t("sortInstructionsStrip.modePanelRegionLabel")}
      className="max-h-[min(50vh,28rem)] overflow-y-auto overflow-x-hidden"
      data-testid="sort-classify-mode-panel"
    >
      {mode === "structure" ? (
        <SortStructureModePanel settings={settings} onSettingsPatch={onSettingsPatch} />
      ) : null}
      {mode === "custom" ? (
        <SortCustomModePanel
          settings={settings}
          onSettingsPatch={onSettingsPatch}
          backendOnline={backendOnline}
        />
      ) : null}
    </div>
  );
}
