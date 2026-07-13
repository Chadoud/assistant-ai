import { z } from "zod";
import type { UserRule } from "../types/settings";
import { request, requestMultipart, requestValidated } from "./client";
import {
  JobSchema,
  FolderNodeSchema,
  HistoryEntrySchema,
  UndoSessionResponseSchema,
} from "./jobSchemas";

// ── Re-export types and schemas consumed by other modules ─────────────────────

export type {
  FileEntry,
  Job,
  HistoryEntry,
  FolderNode,
} from "./jobSchemas";

// ── Request types ─────────────────────────────────────────────────────────────

/** Same job options as ``SortRequest`` but without paths (used for multipart ``/analyze-upload``). */
export type SortUploadPayload = Omit<SortRequest, "file_paths">;

export interface SortRequest {
  file_paths: string[];
  output_dir: string;
  model: string;
  mode: "copy" | "move";
  language: string;
  session_id?: string;
  vision_model?: string;
  rules?: UserRule[];
  dry_run?: boolean;
  on_collision?: "uniquify" | "error";
  min_confidence?: number;
  tesseract_lang?: string;
  tesseract_langs?: string[];
  tesseract_auto?: boolean;
  /** When set, replaces the built-in Ollama system prompt for the primary classify step. */
  sort_system_prompt?: string;
  /** When set, overrides server default for the optional filing briefing step. */
  document_briefing_enable?: boolean;
  /** Connectors/local paths selected for this run (UI source chips). */
  import_sources?: string[];
  /** Nested folder structure template (themes + caps). */
  sort_structure_template?: Record<string, unknown>;
}

/** Gmail slice for ``POST /analyze/with-sources`` (local paths + mail in one job). */
export type GmailAnalyzeSlice = {
  gmail_query: string;
  max_messages: number;
  gmail_import_content: "text" | "attachments" | "both";
};

/** Same fields as ``SortRequest`` plus optional Gmail slice for ``POST /analyze/with-sources``. */
type AnalyzeWithSourcesRequest = SortRequest & {
  gmail?: GmailAnalyzeSlice;
  import_sources?: string[];
};

/** Start progressive Drive sort (``POST /analyze/drive-stream`` / ``/sort/drive-stream``) — no paths until client chunks. */
export type DriveStreamStartRequest = Omit<SortRequest, "file_paths"> & {
  initial_file_paths?: string[];
  /** When set, backend runs Gmail export in parallel with progressive Drive chunks (same job). */
  gmail?: GmailAnalyzeSlice;
  /** Workspace batch connectors selected for this run. */
  import_sources?: string[];
};

/** Append imported local paths for a running Drive stream job. */
type DriveStreamChunkRequest = {
  file_paths: string[];
  ended: boolean;
  /** Monotonic: non-folder file rows seen so far while listing. */
  drive_listing_discovered?: number;
  /** Reuse Electron's Drive download directory across waves (for staging cleanup on the server). */
  browser_staging_dir?: string;
  /** Cumulative Drive download failure count for this chunk or run. */
  drive_fetch_failures?: number;
  /** Drive file IDs that failed to download in this chunk. */
  drive_failed_file_ids?: string[];
  /** Total non-folder files found in the Drive source before filter/cap (monotonic). */
  drive_files_in_source?: number;
};

/** Append locally staged paths to a finished job and re-run analysis (for Drive download retries). */
type AppendClassifyPathsRequest = {
  file_paths: string[];
  drive_fetch_failures?: number;
  drive_failed_file_ids?: string[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Multipart filename for uploads; preserves folder structure from ``webkitdirectory`` picks. */
function multipartFilenameForBrowserFile(f: File): string {
  const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (typeof rel === "string" && rel.trim()) {
    return rel.trim();
  }
  return f.name;
}

function buildAnalyzeUploadFormData(files: File[], payload: SortUploadPayload): FormData {
  const fd = new FormData();
  fd.append("payload", JSON.stringify(payload));
  for (const f of files) {
    fd.append("files", f, multipartFilenameForBrowserFile(f));
  }
  return fd;
}

// ── HTTP client ───────────────────────────────────────────────────────────────

export const jobsApi = {
  analyze: (req: SortRequest, init?: Pick<RequestInit, "signal">) =>
    request<{ job_id: string; session_id: string }>("/analyze", {
      method: "POST",
      body: JSON.stringify(req),
      ...init,
    }),

  analyzeWithSources: (req: AnalyzeWithSourcesRequest, init?: Pick<RequestInit, "signal">) =>
    request<{ job_id: string; session_id: string }>("/analyze/with-sources", {
      method: "POST",
      body: JSON.stringify(req),
      ...init,
    }),

  analyzeUpload: (files: File[], payload: SortUploadPayload) =>
    requestMultipart<{ job_id: string; session_id: string }>(
      "/analyze-upload",
      buildAnalyzeUploadFormData(files, payload)
    ),

  sortUpload: (files: File[], payload: SortUploadPayload) =>
    requestMultipart<{ job_id: string; session_id: string }>(
      "/sort-upload",
      buildAnalyzeUploadFormData(files, payload)
    ),

  apply: (jobId: string, items: { path: string; approved: boolean; folder?: string }[]) =>
    request<{ job_id: string }>("/apply", {
      method: "POST",
      body: JSON.stringify({ job_id: jobId, items }),
    }),

  job: (jobId: string) => requestValidated(`/job/${jobId}`, JobSchema),

  pauseJob: (jobId: string) =>
    request<{ success: boolean }>(`/job/${jobId}/pause`, { method: "POST" }),

  resumeJob: (jobId: string) =>
    request<{ success: boolean }>(`/job/${jobId}/resume`, { method: "POST" }),

  cancelJob: (jobId: string) =>
    request<{ success: boolean }>(`/job/${jobId}/cancel`, { method: "POST" }),

  retryFailed: (jobId: string) =>
    request<{ success: boolean }>(`/job/${jobId}/retry-failed`, { method: "POST" }),

  folderTree: (outputDir: string) =>
    requestValidated("/folder-tree", z.object({ tree: z.array(FolderNodeSchema) }), {
      method: "POST",
      body: JSON.stringify({ output_dir: outputDir }),
    }),

  undoEntry: (entryId: string) =>
    request<{ success: boolean }>("/undo", {
      method: "POST",
      body: JSON.stringify({ entry_id: entryId }),
    }),

  undoSession: (sessionId: string, jobId?: string) =>
    requestValidated("/undo-session", UndoSessionResponseSchema, {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        ...(jobId ? { job_id: jobId } : {}),
      }),
    }),

  reassign: (entryId: string, newFolder: string, outputDir: string) =>
    request<{ success: boolean; new_dest: string; folder: string }>("/reassign", {
      method: "POST",
      body: JSON.stringify({ entry_id: entryId, new_folder: newFolder, output_dir: outputDir }),
    }),

  getHistory: () =>
    requestValidated("/history", z.object({ entries: z.array(HistoryEntrySchema) })),

  analyzeDriveStream: (req: DriveStreamStartRequest, init?: Pick<RequestInit, "signal">) =>
    request<{ job_id: string; session_id: string }>("/analyze/drive-stream", {
      method: "POST",
      body: JSON.stringify(req),
      ...init,
    }),

  sortDriveStream: (req: DriveStreamStartRequest, init?: Pick<RequestInit, "signal">) =>
    request<{ job_id: string; session_id: string }>("/sort/drive-stream", {
      method: "POST",
      body: JSON.stringify(req),
      ...init,
    }),

  postDriveStreamChunk: (
    jobId: string,
    body: DriveStreamChunkRequest,
    init?: Pick<RequestInit, "signal">
  ) =>
    request<{ success: boolean }>(`/job/${jobId}/drive-stream-chunk`, {
      method: "POST",
      body: JSON.stringify(body),
      ...init,
    }),

  getDriveFailedFileIds: (jobId: string) =>
    request<{ file_ids: string[]; fetch_failures: number }>(
      `/job/${jobId}/drive-failed-file-ids`
    ),

  appendClassifyPaths: (jobId: string, body: AppendClassifyPathsRequest) =>
    request<{ success: boolean; appended: number }>(
      `/job/${jobId}/append-classify-paths`,
      { method: "POST", body: JSON.stringify(body) }
    ),
};
