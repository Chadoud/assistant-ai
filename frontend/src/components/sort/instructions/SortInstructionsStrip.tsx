import { useCallback, useState } from "react";
import type { AppSettings } from "../../../types/settings";
import { resolveSortClassifyMode } from "../../../utils/inferSortClassifyMode";
import { SortClassifyModeDropdown } from "./SortClassifyModeDropdown";
import { SortClassifyModePanel } from "./SortClassifyModePanel";
import { SortInstructionsSummary } from "./SortInstructionsSummary";
import { SortRulesPopover } from "./popovers/SortRulesPopover";
import { SortInstructionsMigrationBanner } from "./SortInstructionsMigrationBanner";
import { useI18n } from "../../../i18n/I18nContext";

interface SortInstructionsStripProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  backendOnline: boolean;
  className?: string;
}

/**
 * Compact sort strip — grouping dropdown + rules popover; inline panel for selected mode.
 */
export default function SortInstructionsStrip({
  settings,
  onSettingsPatch,
  backendOnline,
  className = "",
}: SortInstructionsStripProps) {
  const { t } = useI18n();
  const [rulesOpen, setRulesOpen] = useState(false);
  const mode = resolveSortClassifyMode(settings);

  const patchSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      const next: Partial<AppSettings> = { ...patch };
      if (patch.sortStructureTemplate?.enabled === true) {
        next.sortClassifyMode = "structure";
      }
      if (typeof patch.sortSystemPrompt === "string" && patch.sortSystemPrompt.trim()) {
        next.sortClassifyMode = "custom";
      }
      onSettingsPatch(next);
    },
    [onSettingsPatch]
  );

  return (
    <section
      data-tour="sort-instructions-strip"
      className={`rounded-xl border border-border bg-bg-card/80 px-3 py-3 space-y-2.5 ${className}`.trim()}
      aria-label={t("sortInstructionsStrip.ariaLabel")}
    >
      <SortInstructionsMigrationBanner settings={settings} />

      <div className="flex flex-wrap items-center gap-2">
        <SortClassifyModeDropdown settings={settings} onSettingsPatch={onSettingsPatch} />
        <SortRulesPopover
          settings={settings}
          onSettingsPatch={patchSettings}
          open={rulesOpen}
          onOpenChange={setRulesOpen}
        />
      </div>

      {mode !== "builtin" ? (
        <SortClassifyModePanel
          settings={settings}
          onSettingsPatch={patchSettings}
          backendOnline={backendOnline}
        />
      ) : null}

      <SortInstructionsSummary settings={settings} />
    </section>
  );
}
