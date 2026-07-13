/**
 * Zod schemas and inferred TypeScript types for the Jobs API.
 *
 * Keeping schemas in their own module lets them be imported without pulling in
 * the HTTP client functions, and makes it straightforward to unit-test shape
 * validation against fixture payloads.
 */

import { z } from "zod";

// ── Schemas ───────────────────────────────────────────────────────────────────

export const FileEntrySchema = z.object({
  path: z.string(),
  name: z.string(),
  status: z.enum(["pending", "reading", "classifying", "review_ready", "applying", "done", "error"]),
  suggested_folder: z.string().nullable(),
  final_folder: z.string().nullable(),
  confidence: z.number(),
  reason: z.string().nullable(),
  approved: z.boolean(),
  dest_path: z.string().nullable(),
  error: z.string().nullable(),
  entry_id: z.string().nullable(),
  analysis_excerpt: z.string().nullish(),
  extraction_source: z.string().nullish(),
  extraction_quality: z.number().nullish(),
  extraction_signals: z.record(z.string(), z.unknown()).optional(),
  candidate_scores: z.array(z.object({ folder_name: z.string(), score: z.number() })).optional(),
  decision_reason: z.string().nullish(),
  rule_applied_id: z.string().nullish(),
  llm_confidence: z.number().nullish(),
  rerank_top_score: z.number().nullish(),
  llm_folder_name: z.string().nullish(),
  classification_disagree: z.boolean().nullish(),
  primary_purpose: z.string().nullish(),
  llm_reason: z.string().nullish(),
  detected_language: z.string().nullish(),
  document_briefing: z.string().nullish(),
  doc_kind: z.string().nullish(),
  decision_trace: z.record(z.string(), z.unknown()).optional(),
  analyze_duration_ms: z.number().nullish(),
  analyze_extract_ms: z.number().nullish(),
  analyze_briefing_ms: z.number().nullish(),
  analyze_classify_ms: z.number().nullish(),
  structure_values: z.record(z.string(), z.string()).optional(),
  structure_path_provisional: z.string().nullish(),
  structure_cap_rewritten: z.boolean().optional(),
  size_bytes: z.number().optional(),
  /**
   * Gmail import-sort only: message body .txt vs downloaded attachment.
   * The API omits or sets **null** for local paths and other sources (e.g. Drive staging); `optional()`
   * alone does not accept JSON `null`, so this must be nullish.
   */
  gmail_staged_part: z.enum(["message_body", "attachment"]).nullish(),
});

const JobConfigSchema = z.object({
  output_dir: z.string(),
  model: z.string(),
  mode: z.enum(["copy", "move"]),
  language: z.string(),
  vision_model: z.string().nullable().optional(),
  rules: z.array(z.record(z.string(), z.unknown())).optional(),
  dry_run: z.boolean().optional(),
  on_collision: z.enum(["uniquify", "error"]).optional(),
  min_confidence: z.number().nullable().optional(),
  tesseract_lang: z.string().nullable().optional(),
  tesseract_langs: z.array(z.string()).nullable().optional(),
  tesseract_auto: z.boolean().optional(),
  sort_system_prompt: z.string().nullable().optional(),
  sort_structure_template: z.record(z.string(), z.unknown()).nullable().optional(),
  document_briefing_enable: z.boolean().nullable().optional(),
});

export const JobSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  phase: z.enum(["analyzing", "awaiting_approval", "applying", "paused", "cancelled", "done"]),
  total: z.number(),
  completed: z.number(),
  last_processed_index: z.number(),
  pause_requested: z.boolean(),
  cancel_requested: z.boolean(),
  files: z.array(FileEntrySchema),
  status: z.enum(["running", "awaiting_approval", "paused", "cancelled", "done"]),
  error: z.string().nullable(),
  worker_active: z.boolean().optional(),
  /** True while Gmail ``import-sort`` producer thread is still exporting messages to staging. */
  gmail_import_fetching: z.boolean().optional(),
  /**
   * Message total for the Gmail list ``q`` used for this run: at enqueue the backend sets an
   * **exact** count when it can (label ``messagesTotal`` for plain Inbox/Spam, otherwise full
   * ``messages.list`` paging with the same ``q`` as export). If that preflight fails, it falls
   * back to Gmail's ``resultSizeEstimate`` (often wrong, e.g. 501 for huge searches). While
   * pages stream, the value is never lowered below the preflight (it can only move up with
   * per-page estimates). Not a per-file count for "Both" (one message can become multiple files).
   */
  gmail_messages_total_estimate: z.union([z.number().int().min(0), z.null()]).optional(),
  /** Canonical search query (after server normalization of legacy primary-tab shims). */
  gmail_query: z.string().optional(),
  /** Actual ``q`` sent to ``users.messages.list`` (e.g. may append ``has:attachment`` in attachments-only mode). */
  gmail_list_query: z.string().optional(),
  gmail_import_content: z.enum(["text", "attachments", "both"]).optional(),
  gmail_max_messages: z.number().optional(),
  /** Gmail export progress: messages fully processed in the feeder (not Gmail search estimate). */
  gmail_export_messages: z.number().int().min(0).optional(),
  gmail_export_text_files: z.number().int().min(0).optional(),
  gmail_export_attachment_files: z.number().int().min(0).optional(),
  /** Gmail ``attachments.get`` calls that failed (HTTP 4xx/5xx). */
  gmail_export_attachment_fetch_failures: z.number().int().min(0).optional(),
  /** Staging byte budget was hit; export may stop before the message cap. */
  gmail_export_staging_capped: z.boolean().optional(),
  /** Client JSON snapshot of UI scope, max messages, and import mode (Gmail import-sort). */
  gmail_ui_parameters_json: z.string().optional(),
  /** True while a progressive Google Drive list/import is still appending to the job. */
  drive_import_fetching: z.boolean().optional(),
  /** Non-folder rows discovered so far (from client, monotonic). */
  drive_listing_discovered: z.number().int().min(0).optional(),
  /** Cumulative count of Drive files that failed to download during import. */
  drive_import_fetch_failures: z.number().int().min(0).optional(),
  /** Google Drive file IDs that failed to download — enables retry from the UI. */
  drive_import_failed_file_ids: z.array(z.string()).optional(),
  /** Connectors/local paths selected for this run (UI source chips). */
  job_import_sources: z.array(z.string()).optional(),
  /** Total non-folder files found in the Drive source before filter/cap (raw Drive count). */
  drive_files_in_source: z.number().int().min(0).optional(),
  config: JobConfigSchema.optional(),
  created_at: z.number().optional(),
  updated_at: z.number().optional(),
});

/** Output tree node; ``children`` present when the backend returns nested folders. */
export type FolderNode = {
  name: string;
  path: string;
  files: string[];
  children?: FolderNode[];
};

export const FolderNodeSchema: z.ZodType<FolderNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    files: z.array(z.string()),
    children: z.array(FolderNodeSchema).optional(),
  })
);

export const HistoryEntrySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  source_path: z.string(),
  dest_path: z.string(),
  folder_name: z.string(),
  mode: z.enum(["copy", "move"]),
  session_id: z.string(),
  undone: z.boolean(),
});

const UndoSessionResultItemSchema = z.object({
  id: z.string(),
  success: z.boolean(),
});

export const UndoSessionResponseSchema = z.object({
  results: z.array(UndoSessionResultItemSchema),
  job: JobSchema.nullable().optional(),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type FileEntry = z.infer<typeof FileEntrySchema>;
export type Job = z.infer<typeof JobSchema>;
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
