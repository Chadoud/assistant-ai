import { useMemo } from "react";
import { GMAIL_EXPORT_MAX_MESSAGES, UNCERTAIN_FOLDER } from "../../constants";
import { formatIntegerApostropheThousands } from "../../utils/format";
import type { QueueJobState } from "./queuePanelTypes";

type UseQueueJobMetricsArgs = Pick<QueueJobState, "currentJob" | "totalCount" | "processedCount" | "reviewRows"> & {
  isRunning: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

/** Derived pipeline counts, Gmail/Drive import progress, and file-list stats for the queue panel. */
export function useQueueJobMetrics({
  currentJob,
  isRunning,
  totalCount,
  processedCount,
  reviewRows,
  t,
}: UseQueueJobMetricsArgs) {
  const gmailImportStillFetching = currentJob?.gmail_import_fetching === true;
  const driveImportStillFetching = currentJob?.drive_import_fetching === true;
  const driveListingDiscovered =
    typeof currentJob?.drive_listing_discovered === "number" &&
    Number.isFinite(currentJob.drive_listing_discovered) &&
    currentJob.drive_listing_discovered >= 0
      ? currentJob.drive_listing_discovered
      : null;
  const driveFilesInSource =
    typeof currentJob?.drive_files_in_source === "number" &&
    Number.isFinite(currentJob.drive_files_in_source) &&
    currentJob.drive_files_in_source > 0
      ? currentJob.drive_files_in_source
      : null;
  const driveExpectedFileTotal = driveListingDiscovered;
  const gmailMessagesListEstimate =
    typeof currentJob?.gmail_messages_total_estimate === "number" &&
    Number.isFinite(currentJob.gmail_messages_total_estimate) &&
    currentJob.gmail_messages_total_estimate > 0
      ? currentJob.gmail_messages_total_estimate
      : null;
  const showGmailJobProgressCard =
    isRunning &&
    (totalCount > 0 ||
      gmailImportStillFetching ||
      driveImportStillFetching ||
      gmailMessagesListEstimate !== null);

  const isGmailImportJob = Boolean(
    currentJob?.gmail_import_content === "text" ||
      currentJob?.gmail_import_content === "attachments" ||
      currentJob?.gmail_import_content === "both" ||
      gmailImportStillFetching,
  );
  const showJobSnapshotSection =
    totalCount > 0 ||
    (isRunning && isGmailImportJob && gmailImportStillFetching) ||
    (isRunning && driveImportStillFetching);

  const gmailMaxRaw =
    typeof currentJob?.gmail_max_messages === "number" ? currentJob.gmail_max_messages : null;
  const gmailMaxJobLabel = useMemo(() => {
    if (gmailMaxRaw === null || !Number.isFinite(gmailMaxRaw)) return null;
    if (gmailMaxRaw >= GMAIL_EXPORT_MAX_MESSAGES) {
      return t("queue.gmailJobMaxAll");
    }
    return formatIntegerApostropheThousands(gmailMaxRaw);
  }, [gmailMaxRaw, t]);

  const pipelineCountTotal = useMemo(() => {
    if (currentJob?.status === "done" || currentJob?.status === "cancelled") {
      return Math.max(totalCount, 1);
    }
    let n = Math.max(totalCount, 1);

    const driveSlot =
      driveImportStillFetching && driveExpectedFileTotal !== null && driveExpectedFileTotal > 0
        ? driveExpectedFileTotal
        : 0;

    let gmailSlot = 0;
    if (isGmailImportJob && gmailMessagesListEstimate !== null) {
      gmailSlot = Math.max(gmailSlot, gmailMessagesListEstimate);
    }
    if (
      gmailMaxRaw != null &&
      Number.isFinite(gmailMaxRaw) &&
      gmailMaxRaw < GMAIL_EXPORT_MAX_MESSAGES &&
      isGmailImportJob &&
      gmailImportStillFetching
    ) {
      gmailSlot = Math.max(gmailSlot, gmailMaxRaw, totalCount);
    }

    const gmailLegActive =
      isGmailImportJob &&
      (gmailMessagesListEstimate !== null || gmailImportStillFetching || gmailSlot > 0);
    const bothDriveAndGmail = driveSlot > 0 && gmailLegActive;

    if (bothDriveAndGmail) {
      n = Math.max(n, totalCount, driveSlot + gmailSlot);
    } else {
      n = Math.max(n, driveSlot, gmailSlot);
    }
    return n;
  }, [
    currentJob?.status,
    driveExpectedFileTotal,
    driveImportStillFetching,
    gmailMaxRaw,
    isGmailImportJob,
    gmailImportStillFetching,
    totalCount,
    gmailMessagesListEstimate,
  ]);

  const jobSnapshotTotalDisplay = useMemo(() => {
    if (currentJob?.status === "done" || currentJob?.status === "cancelled") {
      return totalCount;
    }
    const active =
      currentJob?.status === "running" ||
      currentJob?.status === "paused" ||
      currentJob?.status === "awaiting_approval";
    if (!active) return totalCount;

    const usePipelineTotal =
      gmailImportStillFetching ||
      driveImportStillFetching ||
      (isGmailImportJob && gmailMessagesListEstimate !== null);

    if (usePipelineTotal) return pipelineCountTotal;
    return totalCount;
  }, [
    currentJob?.status,
    driveImportStillFetching,
    gmailImportStillFetching,
    gmailMessagesListEstimate,
    isGmailImportJob,
    pipelineCountTotal,
    totalCount,
  ]);

  const pipelineRemaining = Math.max(0, pipelineCountTotal - processedCount);
  const jobConfigDryRun = !!currentJob?.config?.dry_run;

  const files = useMemo(() => currentJob?.files ?? [], [currentJob]);
  const sortedFileCount = files.filter((f) => f.status === "done").length;
  const classifiedCertainCount = files.filter((f) => {
    if (f.status !== "review_ready" && f.status !== "done" && f.status !== "applying") return false;
    const sf = f.suggested_folder;
    return typeof sf === "string" && sf.length > 0 && sf !== UNCERTAIN_FOLDER;
  }).length;
  const isApplyOrCompletePhase =
    currentJob?.phase === "applying" || currentJob?.phase === "done";
  const midStatValue = isApplyOrCompletePhase ? sortedFileCount : classifiedCertainCount;
  const midStatLabel = isApplyOrCompletePhase ? t("queue.sorted") : t("queue.classified");
  const hasAiTouchedFile = files.some((f) =>
    ["review_ready", "done", "error", "reading", "classifying", "applying"].includes(f.status)
  );
  const uncertainCount = useMemo(
    () =>
      files.filter((f) => {
        const classified =
          f.status === "review_ready" ||
          f.status === "applying" ||
          f.status === "done" ||
          (f.status === "error" && f.suggested_folder != null);
        if (!classified) return false;
        const sf = f.suggested_folder;
        return typeof sf === "string" && sf === UNCERTAIN_FOLDER;
      }).length,
    [files]
  );

  const jobPipelineDisplayPct = useMemo(() => {
    if (!isRunning || pipelineCountTotal <= 0) return 0;
    return Math.max(0, Math.min(100, (processedCount / pipelineCountTotal) * 100));
  }, [isRunning, pipelineCountTotal, processedCount]);

  const prepCanShowJobPipelinePct = Boolean(
    currentJob &&
      isRunning &&
      currentJob.status === "running" &&
      (totalCount > 0 ||
        gmailMessagesListEstimate !== null ||
        (driveImportStillFetching && driveListingDiscovered !== null))
  );

  return {
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
    prepCanShowJobPipelinePct,
    processedCount,
    reviewRows,
  };
}
