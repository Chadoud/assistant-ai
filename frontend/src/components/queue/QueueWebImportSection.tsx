import DropZone from "../DropZone";
import WorkspaceExternalSourcesSection from "../workspace/WorkspaceExternalSourcesSection";
import { Spinner } from "../Spinner";
import { SECONDARY_BTN_CLASS } from "../../utils/styles";
import type { QueuePanelController } from "./useQueuePanelController";
import type { QueuePanelProps } from "./queuePanelProps";
import type { QueueActions } from "./queuePanelTypes";
import {
  QueueSendingHint,
  QueueWorkspacePrepProgress,
} from "./QueueWorkspacePrepProgress";

type QueueWebImportSectionProps = Pick<QueuePanelProps, "workspaceExternalSources"> &
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
    onFiles: QueueActions["onFiles"];
    onBrowserFiles: QueueActions["onBrowserFiles"];
    /** When true, prep-only card during batch start is suppressed (wizard owns Run). */
    hideRunRow?: boolean;
  };

/** Web drop zone, external sources, and prep card while batch start is in flight. */
export function QueueWebImportSection({
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
  onFiles,
  onBrowserFiles,
  hideRunRow = false,
}: QueueWebImportSectionProps) {
  const {
    desktop,
    previewCount,
    setPreviewCount,
    workspaceBatchStarting,
    workspacePrepGmailInBatch,
    handleCancelWorkspaceBatchStart,
  } = workspaceBatch;

  const {
    prepCanShowJobPipelinePct,
    pipelineCountTotal,
    processedCount,
    pipelineRemaining,
    jobPipelineDisplayPct,
  } = jobMetrics;

  if (desktop) return null;

  if (!hideWorkspaceCardsRow) {
    return (
      <>
        <span className="text-sm font-semibold text-text-primary">
          {t("queue.externalSourcesSummary")}
        </span>
        <WorkspaceExternalSourcesSection {...workspaceExternalSources} />
        <DropZone
          onFiles={(paths) => {
            if (paths.length > 0) setPreviewCount(paths.length);
            return onFiles(paths);
          }}
          onBrowserFiles={
            onBrowserFiles
              ? async (files, context) => {
                  if (files.length > 0) setPreviewCount(files.length);
                  await onBrowserFiles(files, context);
                }
              : undefined
          }
          disabled={sortInputDisabled}
          disabledReason={sortInputDisabledReason}
        />
        <QueueSendingHint
          previewCount={sendingWithoutJobYet ? previewCount : null}
          t={t}
          className="flex items-center gap-2 justify-center text-xs text-muted -mt-2"
        />
      </>
    );
  }

  if (!currentJob && !hideRunRow && (workspaceBatchStarting || sendingWithoutJobYet)) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-bg-secondary/40 px-4 py-6 text-sm text-muted"
        role="status"
        aria-label={t("queue.workspacePrepBarAria")}
      >
        <Spinner className="w-5 h-5 text-accent" aria-hidden />
        <span className="text-center">
          {workspaceBatchStarting
            ? t("queue.workspaceRunBatchStarting")
            : previewCount === 1
              ? t("queue.sendingAiOne")
              : t("queue.sendingAi", { count: previewCount! })}
        </span>
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
          variant="card"
        />
        {workspaceBatchStarting ? (
          <button
            type="button"
            onClick={handleCancelWorkspaceBatchStart}
            className={`${SECONDARY_BTN_CLASS} px-4 text-sm shrink-0`}
          >
            {t("queue.workspaceRunBatchCancel")}
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}
