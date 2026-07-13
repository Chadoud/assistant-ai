import { useMemo } from "react";
import PostRunNextSteps from "../PostRunNextSteps";
import SortPlanFriendly from "../SortPlanFriendly";
import { SortedFoldersTreeSection } from "./SortedFoldersTreeSection";
import { buildJobFolderTree } from "../../utils/buildJobFolderTree";
import { SECONDARY_BTN_CLASS } from "../../utils/styles";
import { downloadJobPlanCsv } from "../../utils/exportJobPlan";
import { resolveSortClassifyMode } from "../../utils/inferSortClassifyMode";
import {
  isSortStructureJobConfig,
  resolveStructureModulesForActiveJob,
} from "../../utils/sortStructureJobConfig";
import { QueueActiveJobCard } from "./QueueActiveJobCard";
import { QueueVirtualizedFileList } from "./QueueVirtualizedFileList";
import { QueueReviewApprovalPanel } from "./QueueReviewApprovalPanel";
import type { QueuePanelController } from "./useQueuePanelController";
import type { QueuePanelProps } from "./queuePanelProps";
import type { QueueActions } from "./queuePanelTypes";

type QueuePanelJobSectionProps = Pick<QueuePanelProps, "settings" | "telemetryOptIn" | "uiLocale"> &
  Pick<
    QueuePanelController,
    | "t"
    | "currentJob"
    | "sessionId"
    | "isRunning"
    | "isAwaitingApproval"
    | "totalCount"
    | "processedCount"
    | "failedFiles"
    | "fetchFailureCount"
    | "reviewRows"
    | "showPostRunCard"
    | "dismissPostRunPermanent"
    | "hidePostRunForSessionAfterCta"
    | "focusDropZoneAfterPostRun"
    | "startNewSort"
    | "workspaceBatch"
    | "handleCancelJob"
    | "jobMetrics"
    | "prepProgressMode"
    | "listParentRef"
    | "rowVirtualizer"
    | "destFolderInsights"
  > &
  Pick<
    QueueActions,
    | "onPause"
    | "onResume"
    | "onRetryFailed"
    | "onRetryDriveDownloads"
    | "onUndoAll"
    | "onUpdateReviewRow"
    | "onApproveAll"
    | "onRejectAll"
    | "onApplyApproved"
    | "onUndoEntry"
    | "onReassignFile"
    | "onGoToOverview"
    | "onGoToHistory"
    | "onOpenOutputSettings"
  > &
  Pick<QueuePanelProps, "onOpenFolder" | "onRevealFile"> & {
    onFolderViewModeChange: (mode: "rows" | "grid") => void;
  };

/** Active job card, post-run CTAs, sort plan, review panel, and virtualized file list. */
export function QueuePanelJobSection({
  settings,
  telemetryOptIn,
  uiLocale,
  t,
  currentJob,
  sessionId,
  isRunning,
  isAwaitingApproval,
  totalCount,
  processedCount,
  failedFiles,
  fetchFailureCount,
  reviewRows,
  showPostRunCard,
  dismissPostRunPermanent,
  hidePostRunForSessionAfterCta,
  focusDropZoneAfterPostRun,
  startNewSort,
  workspaceBatch,
  handleCancelJob,
  jobMetrics,
  prepProgressMode,
  listParentRef,
  rowVirtualizer,
  destFolderInsights,
  onPause,
  onResume,
  onRetryFailed,
  onRetryDriveDownloads,
  onUndoAll,
  onUpdateReviewRow,
  onApproveAll,
  onRejectAll,
  onApplyApproved,
  onUndoEntry,
  onReassignFile,
  onGoToOverview,
  onGoToHistory,
  onOpenOutputSettings,
  onOpenFolder,
  onRevealFile,
  onFolderViewModeChange,
}: QueuePanelJobSectionProps) {
  const { sortRunStartedAtMs } = workspaceBatch;
  const {
    gmailImportStillFetching,
    driveImportStillFetching,
    driveListingDiscovered,
    driveFilesInSource,
    gmailMessagesListEstimate,
    showGmailJobProgressCard,
    isGmailImportJob,
    showJobSnapshotSection,
    gmailMaxJobLabel,
    pipelineCountTotal,
    jobSnapshotTotalDisplay,
    pipelineRemaining,
    jobConfigDryRun,
    files,
    sortedFileCount,
    midStatValue,
    midStatLabel,
    isApplyOrCompletePhase,
    hasAiTouchedFile,
    uncertainCount,
    jobPipelineDisplayPct,
  } = jobMetrics;

  const structureModules =
    isSortStructureJobConfig(currentJob?.config) || resolveSortClassifyMode(settings) === "structure"
      ? resolveStructureModulesForActiveJob(currentJob, settings)
      : [];

  const jobFolderTree = useMemo(() => buildJobFolderTree(currentJob), [currentJob]);

  return (
    <>
      {settings.outputDir && !currentJob ? (
        <button
          type="button"
          onClick={onOpenOutputSettings}
          title={t("queue.outputFolderChangeHint")}
          aria-label={`${t("queue.outputFolderChangeHint")}: ${settings.outputDir}`}
          className="group mx-auto flex max-w-full items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-bg-secondary/80 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15" />
          </svg>
          <span className="truncate max-w-[min(100%,20rem)] sm:max-w-[24rem]">
            {t("queue.outputTo")}{" "}
            <span className="text-text-primary group-hover:text-accent">{settings.outputDir}</span>
          </span>
        </button>
      ) : null}

      {jobConfigDryRun && currentJob ? (
        <div
          className="rounded-xl border border-info-line bg-info-soft px-4 py-2.5 text-sm text-info"
          role="status"
        >
          {t("queue.dryRunBanner")}
        </div>
      ) : null}

      {currentJob?.gmail_export_staging_capped && isGmailImportJob ? (
        <div
          className="rounded-xl border border-warning-line bg-warning-soft px-4 py-2.5 text-sm text-warning"
          role="status"
        >
          {t("queue.gmailStagingCapBanner")}
        </div>
      ) : null}

      {currentJob ? (
        <QueueActiveJobCard
          currentJob={currentJob}
          sortRunStartedAtMs={sortRunStartedAtMs}
          settingsOutputDir={settings.outputDir}
          isRunning={isRunning}
          totalCount={totalCount}
          processedCount={processedCount}
          failedFiles={failedFiles}
          fetchFailureCount={fetchFailureCount}
          sessionId={sessionId}
          showGmailJobProgressCard={showGmailJobProgressCard}
          isGmailImportJob={isGmailImportJob}
          showJobSnapshotSection={showJobSnapshotSection}
          gmailImportStillFetching={gmailImportStillFetching}
          driveImportStillFetching={driveImportStillFetching}
          driveListingDiscovered={driveListingDiscovered}
          driveFilesInSource={driveFilesInSource}
          gmailMessagesListEstimate={gmailMessagesListEstimate}
          jobSnapshotTotalDisplay={jobSnapshotTotalDisplay}
          pipelineCountTotal={pipelineCountTotal}
          pipelineRemaining={pipelineRemaining}
          jobPipelineDisplayPct={jobPipelineDisplayPct}
          midStatLabel={midStatLabel}
          midStatValue={midStatValue}
          isApplyOrCompletePhase={isApplyOrCompletePhase}
          uncertainCount={uncertainCount}
          destFolderInsights={destFolderInsights}
          structureModules={structureModules}
          prepProgressMode={prepProgressMode}
          gmailMaxJobLabel={gmailMaxJobLabel}
          onPause={onPause}
          onResume={onResume}
          onCancel={handleCancelJob}
          onRetryFailed={onRetryFailed}
          onRetryDriveDownloads={onRetryDriveDownloads}
          onUndoAll={onUndoAll}
          onStartNewSort={startNewSort}
        />
      ) : null}

      {showPostRunCard ? (
        <PostRunNextSteps
          totalCount={totalCount}
          sortedCount={sortedFileCount}
          failedSortCount={failedFiles.length}
          failedFetchCount={fetchFailureCount}
          uncertainCount={uncertainCount}
          telemetryOptIn={telemetryOptIn}
          uiLocale={uiLocale}
          onGoToOverview={onGoToOverview}
          onGoToHistory={onGoToHistory}
          onDismiss={dismissPostRunPermanent}
          onAfterCta={hidePostRunForSessionAfterCta}
          onFocusDropZone={focusDropZoneAfterPostRun}
        />
      ) : null}

      {currentJob && currentJob.files.length > 0 && !isAwaitingApproval ? (
        currentJob.config?.dry_run ? (
          <SortPlanFriendly
            job={currentJob}
            variant="full"
            destinationLegendRows={{
              display: destFolderInsights.display,
              full: destFolderInsights.full,
            }}
          />
        ) : (
          <SortedFoldersTreeSection
            folderTree={jobFolderTree}
            folderViewMode={settings.folderViewMode}
            onFolderViewModeChange={onFolderViewModeChange}
            onOpenFolder={onOpenFolder}
            onRevealFile={onRevealFile}
            jobFileCount={currentJob.files.length}
          />
        )
      ) : null}

      {currentJob && currentJob.files.length > 0 && !isAwaitingApproval ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => downloadJobPlanCsv(currentJob)}
            className={SECONDARY_BTN_CLASS}
          >
            {t("queue.exportCsv")}
          </button>
        </div>
      ) : null}

      {currentJob && isAwaitingApproval && currentJob.files.length > 0 ? (
        <SortPlanFriendly job={currentJob} variant="banner" />
      ) : null}

      {currentJob ? (
        <QueueReviewApprovalPanel
          currentJob={currentJob}
          reviewRows={reviewRows}
          isAwaitingApproval={isAwaitingApproval}
          telemetryOptIn={telemetryOptIn}
          uiLocale={uiLocale}
          onUpdateReviewRow={onUpdateReviewRow}
          onApproveAll={onApproveAll}
          onRejectAll={onRejectAll}
          onApplyApproved={onApplyApproved}
        />
      ) : null}

      {currentJob && files.length > 0 ? (
        <QueueVirtualizedFileList
          isRunning={isRunning}
          totalCount={totalCount}
          sortedFileCount={sortedFileCount}
          failedFiles={failedFiles}
          fetchFailureCount={fetchFailureCount}
          hasAiTouchedFile={hasAiTouchedFile}
          files={files}
          listParentRef={listParentRef}
          rowVirtualizer={rowVirtualizer}
          onUndoEntry={onUndoEntry}
          onReassignFile={onReassignFile}
        />
      ) : null}
    </>
  );
}
