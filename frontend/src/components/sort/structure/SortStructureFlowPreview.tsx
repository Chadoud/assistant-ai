import type { SortStructureModule } from "../../../types/sortStructure";
import { useI18n } from "../../../i18n/I18nContext";
import { themeLabel } from "../../../utils/sortStructureSummaryText";
import { moduleToChain } from "../../../utils/sortStructureTreeOps";
import { SORT_STRUCTURE_FLOW_CARD_SIZE_CLASS } from "./SortStructureFlowNodeCard";

function FlowConnector() {
  return (
    <div className="mx-4 flex shrink-0 items-center justify-center self-stretch py-1" aria-hidden>
      <svg className="text-muted/80" width="24" height="16" viewBox="0 0 24 16">
        <path
          d="M2 8h14m0 0-3-3m3 3-3 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function PreviewNode({ module, levelIndex }: { module: SortStructureModule; levelIndex: number }) {
  const { t } = useI18n();
  const label = themeLabel(module.theme, t, module.customLabel);
  const levelLabel = t("settings.sortStructure.flowLevelLabel", { n: levelIndex + 1 });

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border-2 border-border bg-bg-secondary px-2.5 py-2 text-center ${SORT_STRUCTURE_FLOW_CARD_SIZE_CLASS}`}
      aria-label={t("settings.sortStructure.flowNodeAria", { label, level: levelIndex + 1 })}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{levelLabel}</span>
      <span className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-text-primary">{label}</span>
      {module.maxFolders != null && module.theme !== "auto" ? (
        <span className="mt-1 rounded-full bg-bg-primary px-1.5 py-px text-[10px] text-muted">
          {t("settings.sortStructure.flowCapBadge", { max: module.maxFolders })}
        </span>
      ) : null}
    </div>
  );
}

/** Read-only level cards for the structure template active on a running job. */
export function SortStructureFlowPreview({ modules }: { modules: SortStructureModule[] }) {
  const { t } = useI18n();
  if (!modules.length) return null;

  return (
    <div
      className="min-w-0 max-w-full overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      data-testid="structure-flow-preview"
    >
      <div className="flex min-w-min flex-col gap-4">
        {modules.map((root) => {
          const chain = moduleToChain(root);
          return (
            <div
              key={root.id}
              className="flex items-stretch py-0.5"
              role="group"
              aria-label={t("settings.sortStructure.flowBranchAria")}
            >
              {chain.map((mod, index) => (
                <div key={mod.id} className="flex items-stretch">
                  {index > 0 ? <FlowConnector /> : null}
                  <PreviewNode module={mod} levelIndex={index} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
