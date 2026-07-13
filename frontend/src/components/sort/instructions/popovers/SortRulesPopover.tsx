import type { AppSettings } from "../../../../types/settings";
import RulesSection from "../../../settings/RulesSection";
import { SortInstructionsAnchorPopover } from "../SortInstructionsAnchorPopover";
import { useI18n } from "../../../../i18n/I18nContext";
import { SORT_STRIP_TOOLBAR_BTN_CLASS } from "../sortInstructionsStripStyles";

interface SortRulesPopoverProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Popover for filename sorting rules — always available regardless of classify mode. */
export function SortRulesPopover({
  settings,
  onSettingsPatch,
  open,
  onOpenChange,
}: SortRulesPopoverProps) {
  const { t } = useI18n();
  const activeRules = settings.rules.filter((r) => r.enabled && r.pattern.trim()).length;

  return (
    <SortInstructionsAnchorPopover
      triggerLabel={t("sortInstructionsStrip.rulesButton")}
      panelTitle={t("sortInstructionsStrip.rulesPanelTitle")}
      badge={activeRules}
      open={open}
      onOpenChange={onOpenChange}
      triggerClassName={SORT_STRIP_TOOLBAR_BTN_CLASS}
    >
      <p className="text-sm text-text-secondary mb-3 leading-relaxed">{t("sortInstructionsStrip.rulesPanelHint")}</p>
      <RulesSection settings={settings} onSettingsPatch={onSettingsPatch} />
    </SortInstructionsAnchorPopover>
  );
}
