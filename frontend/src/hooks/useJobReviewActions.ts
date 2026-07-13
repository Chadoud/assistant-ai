import { useCallback } from "react";
import { toast } from "sonner";
import { api, type FileEntry, type Job } from "../api";
import { toastUserError } from "../utils/userGuidance";
import {
  trackReviewBulkApplied,
  trackReviewReassign,
} from "../telemetry/reviewTelemetry";

/**
 * Callbacks for post-classification actions: undo, reassign, lifecycle controls
 * (pause/resume/cancel/retry), apply approved, and file-reveal shortcuts.
 *
 * Extracted from useSortPipelineActions so the enqueue path and the review/apply
 * path can be reasoned about and tested independently.
 */
export function useJobReviewActions(opts: {
  currentJob: Job | null;
  sessionId: string | null;
  setJob: (job: Job | null) => void;
  startPolling: (jobId: string) => void;
  stopPolling: () => void;
  patchFileByEntryId: (entryId: string, patch: Partial<FileEntry>) => void;
  refreshTree: () => Promise<void>;
  settings: { outputDir: string; telemetryOptIn?: boolean; uiLocale?: string };
}) {
  const { currentJob, sessionId, setJob, startPolling, stopPolling, patchFileByEntryId, refreshTree, settings } = opts;
  const telemetryOptIn = settings.telemetryOptIn ?? false;
  const uiLocale = settings.uiLocale ?? "en";

  const handleUndoEntry = useCallback(
    async (entryId: string) => {
      try {
        await api.undoEntry(entryId);
        patchFileByEntryId(entryId, { status: "error", error: "Undone", entry_id: null });
        void refreshTree();
      } catch (e) {
        toastUserError("Undo failed", e);
      }
    },
    [patchFileByEntryId, refreshTree]
  );

  const handleUndoAll = useCallback(async () => {
    if (!sessionId || !currentJob?.id) return;
    try {
      const res = await api.undoSession(sessionId, currentJob.id);
      if (res.job) {
        setJob(res.job);
      } else {
        const j = await api.job(currentJob.id);
        setJob(j);
      }
      void refreshTree();
    } catch (e) {
      toastUserError("Undo all failed", e);
    }
  }, [sessionId, currentJob, setJob, refreshTree]);

  const handleReassign = useCallback(
    async (file: FileEntry, newFolder: string) => {
      if (!file.entry_id || !settings.outputDir) return;
      try {
        const result = await api.reassign(file.entry_id, newFolder, settings.outputDir);
        patchFileByEntryId(file.entry_id, {
          suggested_folder: result.folder,
          final_folder: result.folder,
          dest_path: result.new_dest,
        });
        void refreshTree();
        trackReviewReassign(telemetryOptIn, uiLocale);
      } catch (e) {
        toastUserError("Reassign failed", e);
      }
    },
    [settings.outputDir, patchFileByEntryId, refreshTree, telemetryOptIn, uiLocale]
  );

  const handlePause = useCallback(async () => {
    if (!currentJob) return;
    try {
      await api.pauseJob(currentJob.id);
    } catch (e) {
      toastUserError("Pause failed", e);
    }
  }, [currentJob]);

  const handleResume = useCallback(async () => {
    if (!currentJob) return;
    try {
      await api.resumeJob(currentJob.id);
    } catch (e) {
      toastUserError("Resume failed", e);
    }
  }, [currentJob]);

  const handleCancel = useCallback(async () => {
    if (!currentJob) return;
    try {
      await api.cancelJob(currentJob.id);
      stopPolling();
      setJob(null);
      toast.message("Sort cancelled", { description: "Any files already sorted have been moved back to their original location." });
    } catch (e) {
      toastUserError("Cancel failed", e);
    }
  }, [currentJob, stopPolling, setJob]);

  const handleRetryFailed = useCallback(async () => {
    if (!currentJob) return;
    try {
      await api.retryFailed(currentJob.id);
      startPolling(currentJob.id);
    } catch (e) {
      toastUserError("Retry failed", e);
    }
  }, [currentJob, startPolling]);

  const handleRetryDriveDownloads = useCallback(async () => {
    if (!currentJob) return;
    const fileIds = currentJob.drive_import_failed_file_ids ?? [];
    if (fileIds.length === 0) return;
    if (!window.electronAPI?.integrationImportGoogleDriveFiles) {
      toast.error("Drive retry requires the desktop app.");
      return;
    }
    toast.message(`Retrying ${fileIds.length} Drive download${fileIds.length === 1 ? "" : "s"}…`);
    try {
      const dr = await window.electronAPI.integrationImportGoogleDriveFiles({ fileIds });
      if (!dr.ok) {
        toast.error("Drive retry download failed", { description: dr.reason ?? "" });
        return;
      }
      const localPaths = (dr.localPaths ?? []).map((p) => p.trim()).filter(Boolean);
      const stillFailed = dr.failed ?? [];
      if (localPaths.length === 0 && stillFailed.length > 0) {
        toast.error(`All ${stillFailed.length} Drive file${stillFailed.length === 1 ? "" : "s"} failed again — check your Drive connection.`);
        return;
      }
      await api.appendClassifyPaths(currentJob.id, {
        file_paths: localPaths,
        ...(stillFailed.length > 0 ? { drive_fetch_failures: stillFailed.length, drive_failed_file_ids: stillFailed.map((f) => f.id) } : {}),
      });
      startPolling(currentJob.id);
      if (stillFailed.length > 0) {
        toast.message(`Downloaded ${localPaths.length} file${localPaths.length === 1 ? "" : "s"} — ${stillFailed.length} still failed.`);
      } else {
        toast.message(`Downloaded ${localPaths.length} file${localPaths.length === 1 ? "" : "s"} — classifying now.`);
      }
    } catch (e) {
      toastUserError("Drive retry failed", e);
    }
  }, [currentJob, startPolling]);

  const handleApplyApproved = useCallback(async () => {
    if (!currentJob) return;
    const approvedCount = currentJob.files.filter((f) => f.approved).length;
    try {
      await api.apply(
        currentJob.id,
        currentJob.files.map((f) => ({
          path: f.path,
          approved: !!f.approved,
          folder: f.final_folder ?? f.suggested_folder ?? undefined,
        }))
      );
      trackReviewBulkApplied(telemetryOptIn, uiLocale, approvedCount);
      startPolling(currentJob.id);
    } catch (e) {
      toastUserError("Apply failed", e);
    }
  }, [currentJob, startPolling, telemetryOptIn, uiLocale]);

  const handleOpenFolder = useCallback((path: string) => {
    void window.electronAPI?.openPath?.(path);
  }, []);

  const handleRevealFile = useCallback((path: string) => {
    void window.electronAPI?.showInFolder?.(path);
  }, []);

  return {
    handleUndoEntry,
    handleUndoAll,
    handleReassign,
    handlePause,
    handleResume,
    handleCancel,
    handleRetryFailed,
    handleRetryDriveDownloads,
    handleApplyApproved,
    handleOpenFolder,
    handleRevealFile,
  };
}
