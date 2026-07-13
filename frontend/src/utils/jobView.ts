import type { Job, FileEntry } from "../api";

export type ReviewRow = FileEntry;

export function deriveJobView(job: Job | null) {
  const files = job?.files ?? [];
  const totalCount = job?.total ?? 0;
  const doneCount = files.filter((f) => f.status === "done").length;
  /** Any file that has left the queue — avoids progress dropping when status becomes `applying`. */
  const processedCount = files.filter((f) => f.status !== "pending").length;
  const activeFiles = files.filter(
    (f) => f.status === "reading" || f.status === "classifying" || f.status === "applying"
  );
  const failedFiles = files.filter((f) => f.status === "error");
  /** Gmail attachment + Drive download failures during import — not pipeline ``error`` rows. */
  const fetchFailureCount =
    (job?.gmail_export_attachment_fetch_failures ?? 0) +
    (job?.drive_import_fetch_failures ?? 0);
  const pendingCount = files.filter((f) => f.status === "pending").length;
  const reviewRows = files.filter((f) => f.status === "review_ready" || f.status === "error");

  return {
    isRunning: job?.status === "running",
    isAwaitingApproval: job?.phase === "awaiting_approval",
    doneCount,
    totalCount,
    processedCount,
    activeFiles,
    failedFiles,
    fetchFailureCount,
    pendingCount,
    reviewRows,
  };
}

