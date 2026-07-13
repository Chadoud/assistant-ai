import LocalWorkspaceSortCard from "../workspace/LocalWorkspaceSortCard";
import WorkspaceExternalSourcesSection from "../workspace/WorkspaceExternalSourcesSection";
import { Spinner } from "../Spinner";
import { PRIMARY_BTN_CLASS, SECONDARY_BTN_CLASS } from "../../utils/styles";
import type { QueuePanelController } from "./useQueuePanelController";
import type { QueuePanelProps } from "./queuePanelProps";
import {
  QueueSendingHint,
  QueueWorkspacePrepProgress,
} from "./QueueWorkspacePrepProgress";

type QueueDesktopWorkspaceSectionProps = Pick<
  QueuePanelProps,
  "workspaceExternalSources"
> &
  Pick<
    QueuePanelController,
    | "t"
    | "currentJob"
    | "sortInputDisabled"
    | "sortInputDisabledReason"
    | "workspaceBatch"
    | "hideWorkspaceCardsRow"
    | "sendingWithoutJobYet"
    | "prepProgressMode"
    | "prepStallHint"
    | "prepStallTranslationKey"
    | "jobMetrics"
  > & {
    /** When true, Run sort row and prep progress are owned by SortWizard footer. */
    hideRunRow?: boolean;
  };

/** Desktop workspace cards, Run sort row, and prep progress while enqueue is in flight. */
export function QueueDesktopWorkspaceSection({
  workspaceExternalSources,
  t,
  currentJob,
  sortInputDisabled,
  sortInputDisabledReason,
  workspaceBatch,
  hideWorkspaceCardsRow,
  sendingWithoutJobYet,
  prepProgressMode,
  prepStallHint,
  prepStallTranslationKey,
  jobMetrics,
  hideRunRow = false,
}: QueueDesktopWorkspaceSectionProps) {
  const {
    includeLocalInRun,
    setIncludeLocalInRun,
    stagedPaths,
    setStagedPaths,
    addStagedPaths,
    workspaceBatchStarting,
    workspacePrepGmailInBatch,
    handleCancelWorkspaceBatchStart,
    handleRunWorkspaceBatch,
    workspaceBatchDisabled,
    workspaceRunBatchDisabledHint,
    previewCount,
  } = workspaceBatch;

  const {
    prepCanShowJobPipelinePct,
    pipelineCountTotal,
    processedCount,
    pipelineRemaining,
    jobPipelineDisplayPct,
  } = jobMetrics;

  return (
    <div className="space-y-4" data-tour="workspace-sort-sources">
      {!hideWorkspaceCardsRow ? (
        <div className="flex w-full min-w-0 flex-col gap-4">
          <LocalWorkspaceSortCard
            includeLocalInRun={includeLocalInRun}
            onIncludeLocalInRunChange={setIncludeLocalInRun}
            stagedPaths={stagedPaths}
            onAddPaths={addStagedPaths}
            onRemovePath={(p) => setStagedPaths((prev) => prev.filter((x) => x !== p))}
            disabled={sortInputDisabled}
            disabledReason={sortInputDisabledReason}
          />
          <div className="flex min-h-0 min-w-0 w-full flex-col gap-3">
            <span className="text-sm font-semibold text-text-primary">
              {t("queue.externalSourcesSummary")}
            </span>
            <WorkspaceExternalSourcesSection {...workspaceExternalSources} />
          </div>
        </div>
      ) : null}
      {!currentJob && !hideRunRow ? (
        <>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              data-testid="workspace-run-sort"
              data-tour="run-sort"
              onClick={() => void handleRunWorkspaceBatch()}
              disabled={workspaceBatchDisabled}
              title={workspaceRunBatchDisabledHint}
              aria-busy={workspaceBatchStarting}
              className={`${PRIMARY_BTN_CLASS} min-w-[12rem] px-6 ${workspaceBatchStarting ? "disabled:opacity-100 disabled:cursor-wait" : ""}`}
            >
              {workspaceBatchStarting ? (
                <>
                  <Spinner className="w-4 h-4 text-white shrink-0" aria-hidden />
                  <span>{t("queue.workspaceRunBatchStarting")}</span>
                </>
              ) : (
                t("queue.workspaceRunBatch")
              )}
            </button>
            {workspaceBatchStarting ? (
              <button
                type="button"
                onClick={handleCancelWorkspaceBatchStart}
                className={`${SECONDARY_BTN_CLASS} px-4`}
              >
                {t("queue.workspaceRunBatchCancel")}
              </button>
            ) : null}
          </div>
          <QueueSendingHint previewCount={sendingWithoutJobYet ? previewCount : null} t={t} />
          <QueueWorkspacePrepProgress
            mode={prepProgressMode}
            workspaceBatchStarting={workspaceBatchStarting}
            workspacePrepGmailInBatch={workspacePrepGmailInBatch}
            prepStallHint={prepStallHint}
            prepStallTranslationKey={prepStallTranslationKey}
            prepCanShowJobPipelinePct={prepCanShowJobPipelinePct}
            pipelineCountTotal={pipelineCountTotal}
            processedCount={processedCount}
            pipelineRemaining={pipelineRemaining}
            jobPipelineDisplayPct={jobPipelineDisplayPct}
            onCancelWorkspaceBatchStart={handleCancelWorkspaceBatchStart}
            t={t}
          />
        </>
      ) : null}
    </div>
  );
}
