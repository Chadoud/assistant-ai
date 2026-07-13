import type { AppSettings } from "../../types/settings";
import { resolveSortClassifyMode } from "../../utils/inferSortClassifyMode";
import { resolveStructureModulesForActiveJob } from "../../utils/sortStructureJobConfig";
import {
  buildSortInstructionsSummary,
  sortClassifyModeLabel,
} from "../sort/instructions/buildSortInstructionsSummary";
import { SortStructureFlowPreview } from "../sort/structure/SortStructureFlowPreview";
import type { SelectedSourceSummary } from "./buildSelectedSourcesSummary";
import { useI18n } from "../../i18n/I18nContext";

type SortWizardReviewStepProps = {
  settings: AppSettings;
  selectedSourcesSummary: SelectedSourceSummary[];
};

function activeRuleCount(settings: AppSettings): number {
  return settings.rules.filter((rule) => rule.enabled && rule.pattern.trim()).length;
}

/** Step 3 — compact read-only overview before Run. */
export function SortWizardReviewStep({ settings, selectedSourcesSummary }: SortWizardReviewStepProps) {
  const { t } = useI18n();
  const mode = resolveSortClassifyMode(settings);
  const structureModules =
    mode === "structure" ? resolveStructureModulesForActiveJob(null, settings) : [];
  const rulesCount = activeRuleCount(settings);
  const groupingSummary = buildSortInstructionsSummary(settings, t);

  const groupingBody =
    structureModules.length > 0 ? (
      <div className="space-y-2" data-testid="sort-wizard-structure-preview">
        <SortStructureFlowPreview modules={structureModules} />
        {rulesCount > 0 ? (
          <p className="text-2xs text-muted">
            {t("sortInstructionsStrip.summaryRules", { count: rulesCount })}
          </p>
        ) : null}
      </div>
    ) : mode === "custom" && settings.sortSystemPrompt?.trim() ? (
      <div className="space-y-1">
        <p className="text-sm font-medium text-text-primary">{sortClassifyModeLabel(mode, t)}</p>
        <p className="text-sm text-text-secondary leading-relaxed line-clamp-3">
          {settings.sortSystemPrompt.trim()}
        </p>
        {rulesCount > 0 ? (
          <p className="text-2xs text-muted">
            {t("sortInstructionsStrip.summaryRules", { count: rulesCount })}
          </p>
        ) : null}
      </div>
    ) : (
      <div className="space-y-1">
        <p className="text-sm text-text-primary leading-relaxed">{groupingSummary}</p>
      </div>
    );

  return (
    <section
      className="overflow-hidden rounded-xl border border-border bg-bg-card/60"
      aria-label={t("queue.sortWizardStepReview")}
    >
      <dl className="divide-y divide-border/80">
        <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-6">
          <dt className="shrink-0 text-xs font-medium text-muted sm:w-[7.5rem]">
            {t("queue.sortWizardReviewSourcesHeading")}
          </dt>
          <dd className="min-w-0 flex-1">
            <ul className="flex flex-wrap gap-1.5" aria-label={t("queue.sortWizardReviewSourcesHeading")}>
              {selectedSourcesSummary.map((source) => (
                <li
                  key={source.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-primary"
                >
                  <span>{source.label}</span>
                  {source.count != null ? (
                    <span className="tabular-nums text-muted">({source.count})</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </dd>
        </div>

        <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-6">
          <dt className="shrink-0 text-xs font-medium text-muted sm:w-[7.5rem]">
            {t("queue.sortWizardReviewGroupingLabel")}
          </dt>
          <dd className="min-w-0 flex-1">{groupingBody}</dd>
        </div>
      </dl>
    </section>
  );
}
