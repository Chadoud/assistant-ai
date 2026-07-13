import { useRef, useState } from "react";
import type { AppSettings, SortClassifyMode } from "../../../types/settings";
import { useI18n } from "../../../i18n/I18nContext";
import SelectDropdown, {
  SELECT_DROPDOWN_PANEL_CLASS,
  selectDropdownPlainOptionClassName,
} from "../../ui/SelectDropdown";
import { sortClassifyModeLabel } from "./buildSortInstructionsSummary";
import { resolveSortClassifyMode } from "../../../utils/inferSortClassifyMode";
import {
  SORT_CLASSIFY_MODES,
  sortClassifyModeOptionDescription,
  sortClassifyModeOptionTitle,
} from "./sortClassifyModeOptions";
import { SORT_STRIP_TOOLBAR_BTN_CLASS } from "./sortInstructionsStripStyles";

interface SortClassifyModeDropdownProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
}

/**
 * Toolbar dropdown for classify mode — first control on the strip row.
 */
export function SortClassifyModeDropdown({ settings, onSettingsPatch }: SortClassifyModeDropdownProps) {
  const { t } = useI18n();
  const activeMode = resolveSortClassifyMode(settings);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const setMode = (mode: SortClassifyMode) => {
    const patch: Partial<AppSettings> = { sortClassifyMode: mode };
    if (mode === "structure") {
      patch.sortStructureTemplate = { ...settings.sortStructureTemplate, enabled: true };
    }
    onSettingsPatch(patch);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <SelectDropdown
      open={open}
      onOpenChange={setOpen}
      triggerRef={triggerRef}
      triggerId="sort-classify-mode"
      triggerLabel={
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <span className="text-muted shrink-0">{t("sortInstructionsStrip.groupingPrefix")}</span>
          <span className="font-medium text-text-primary truncate">
            {sortClassifyModeLabel(activeMode, t)}
          </span>
        </span>
      }
      ariaLabel={t("sortInstructionsStrip.groupingDropdownLabel")}
      triggerClassName={`${SORT_STRIP_TOOLBAR_BTN_CLASS} !w-auto min-w-[9rem]`}
      portaled
    >
      <div
        role="listbox"
        aria-label={t("sortInstructionsStrip.groupingDropdownLabel")}
        className={`${SELECT_DROPDOWN_PANEL_CLASS} min-w-[14rem]`}
      >
        {SORT_CLASSIFY_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="option"
            aria-selected={activeMode === mode}
            onClick={() => setMode(mode)}
            className={`${selectDropdownPlainOptionClassName(activeMode === mode, "compact")} !py-2`}
          >
            <span className="block font-medium leading-snug">{sortClassifyModeOptionTitle(mode, t)}</span>
            <span className="block text-2xs text-muted leading-snug mt-0.5">
              {sortClassifyModeOptionDescription(mode, t)}
            </span>
          </button>
        ))}
      </div>
    </SelectDropdown>
  );
}
