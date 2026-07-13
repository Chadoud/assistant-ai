import type { SortStructureModule } from "../../../types/sortStructure";
import { useI18n } from "../../../i18n/I18nContext";
import { themeLabel } from "../../../utils/sortStructureSummaryText";

/** Shared dimensions for flow level cards and the add-level placeholder. */
export const SORT_STRUCTURE_FLOW_CARD_SIZE_CLASS =
  "min-h-[4.75rem] min-w-[9rem] max-w-[10.5rem] shrink-0";

interface SortStructureFlowNodeCardProps {
  module: SortStructureModule;
  levelIndex: number;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

/**
 * Git-flow-style rectangle node — theme label + optional cap badge.
 */
export function SortStructureFlowNodeCard({
  module,
  levelIndex,
  selected,
  onSelect,
  onRemove,
}: SortStructureFlowNodeCardProps) {
  const { t } = useI18n();
  const label = themeLabel(module.theme, t, module.customLabel);
  const levelLabel = t("settings.sortStructure.flowLevelLabel", { n: levelIndex + 1 });

  return (
    <div className={`group relative ${SORT_STRUCTURE_FLOW_CARD_SIZE_CLASS}`}>
      <button
        type="button"
        data-testid={`structure-flow-node-${module.id}`}
        aria-pressed={selected}
        aria-label={t("settings.sortStructure.flowNodeAria", { label, level: levelIndex + 1 })}
        onClick={onSelect}
        className={`flex h-full w-full flex-col items-center justify-center rounded-lg border-2 px-2.5 py-2 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
          selected
            ? "border-accent bg-accent-soft shadow-sm ring-1 ring-accent/20"
            : "border-border bg-bg-secondary hover:border-accent/40 hover:bg-bg-card"
        }`}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{levelLabel}</span>
        <span className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-text-primary">{label}</span>
        {module.maxFolders != null && module.theme !== "auto" ? (
          <span className="mt-1 rounded-full bg-bg-primary px-1.5 py-px text-[10px] text-muted">
            {t("settings.sortStructure.flowCapBadge", { max: module.maxFolders })}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        data-testid={`structure-flow-remove-${module.id}`}
        aria-label={t("settings.sortStructure.removeLevel")}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-bg-card text-[11px] font-semibold leading-none text-muted opacity-0 shadow-sm transition-opacity hover:border-destructive hover:bg-destructive hover:text-white group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        ×
      </button>
    </div>
  );
}
