import type { Job } from "../api";
import { isSortStructureJobConfig } from "./sortStructureJobConfig";

const EXCERPT_CSV_MAX = 480;
const CANDIDATES_JSON_MAX = 6000;
const DECISION_TRACE_JSON_MAX = 12000;
/** Cap for Drive failed-id JSON so exports stay openable in Excel. */
const DRIVE_FAILED_IDS_JSON_MAX = 12000;

/** Increment when adding/removing/reordering CSV columns (debug / support). */
const SORT_PLAN_CSV_SCHEMA_VERSION = "4";
const CLASSIFY_AUDIT_JSON_MAX = 8000;
const DOCUMENT_BRIEFING_CSV_MAX = 320;
const STRUCTURE_VALUES_JSON_MAX = 2400;

function escapeCsv(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function boolCsv(v: boolean | null | undefined): string {
  if (v === true) return "true";
  if (v === false) return "false";
  return "";
}

function excerptForCsv(s: string | null | undefined): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= EXCERPT_CSV_MAX) return t;
  return `${t.slice(0, EXCERPT_CSV_MAX)}…`;
}

function filenameTokensPipe(signals: Record<string, unknown> | undefined): string {
  const raw = signals?.filename_tokens;
  if (!Array.isArray(raw)) return "";
  return raw.map((x) => String(x)).join("|");
}

function signalsPageCount(signals: Record<string, unknown> | undefined): string {
  const p = signals?.page_count;
  if (typeof p === "number" && Number.isFinite(p)) return String(p);
  return "";
}

function candidateRanked(cs: { folder_name?: string; score?: number }[] | undefined): { folder_name?: string; score?: number }[] {
  if (!cs?.length) return [];
  return [...cs].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
}

function topCandidate(cs: { folder_name?: string; score?: number }[] | undefined, i: number): [string, string] {
  const c = cs?.[i];
  const name = c?.folder_name != null ? String(c.folder_name) : "";
  const score = c?.score != null && Number.isFinite(c.score) ? String(c.score) : "";
  return [name, score];
}

function candidateMargin(cs: { folder_name?: string; score?: number }[] | undefined): string {
  const ranked = candidateRanked(cs);
  if (ranked.length < 2) return "";
  const first = ranked[0];
  const second = ranked[1];
  if (!first || !second) return "";
  const a = Number(first.score);
  const b = Number(second.score);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  return String(a - b);
}

function candidatesJson(cs: { folder_name?: string; score?: number }[] | undefined): string {
  if (!cs?.length) return "";
  try {
    let j = JSON.stringify(cs);
    if (j.length > CANDIDATES_JSON_MAX) j = `${j.slice(0, CANDIDATES_JSON_MAX)}…`;
    return j;
  } catch {
    return "";
  }
}

function decisionTraceJson(trace: Record<string, unknown> | undefined): string {
  if (!trace || Object.keys(trace).length === 0) return "";
  try {
    let j = JSON.stringify(trace);
    if (j.length > DECISION_TRACE_JSON_MAX) j = `${j.slice(0, DECISION_TRACE_JSON_MAX)}…`;
    return j;
  } catch {
    return "";
  }
}

function classifyAuditJson(trace: Record<string, unknown> | undefined): string {
  const audit = trace?.classify_audit;
  if (!audit || typeof audit !== "object") return "";
  try {
    let j = JSON.stringify(audit);
    if (j.length > CLASSIFY_AUDIT_JSON_MAX) j = `${j.slice(0, CLASSIFY_AUDIT_JSON_MAX)}…`;
    return j;
  } catch {
    return "";
  }
}

function briefingSnippetForCsv(raw: string | null | undefined): string {
  const t = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= DOCUMENT_BRIEFING_CSV_MAX) return t;
  return `${t.slice(0, DOCUMENT_BRIEFING_CSV_MAX)}…`;
}

function structureValuesJson(values: Record<string, string> | undefined): string {
  if (!values || Object.keys(values).length === 0) return "";
  return jsonFieldCapped(values, STRUCTURE_VALUES_JSON_MAX);
}

function traceBool(trace: Record<string, unknown> | undefined, key: string): string {
  const v = trace?.[key];
  if (v === true) return "true";
  if (v === false) return "false";
  return "";
}

function traceString(trace: Record<string, unknown> | undefined, key: string): string {
  const v = trace?.[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

function jobStructureTemplateEnabled(job: Job): string {
  return isSortStructureJobConfig(job.config) ? "true" : "false";
}

/**
 * Best-effort: `marker` e.g. `drive_sort_staging`, `batchId` = next path segment (import wave).
 * Works with Windows and POSIX separators. Empty when not under a recognized `*_sort_staging` folder.
 */
function importStagingHint(path: string): { marker: string; batchId: string } {
  const normalized = path.replace(/\\/g, "/");
  const needle = "_sort_staging/";
  const idx = normalized.toLowerCase().indexOf(needle);
  if (idx === -1) return { marker: "", batchId: "" };
  const before = normalized.slice(0, idx);
  const markerStart = before.lastIndexOf("/") + 1;
  const marker = normalized.slice(markerStart, idx + "_sort_staging".length);
  const after = normalized.slice(idx + needle.length);
  const slash = after.indexOf("/");
  const batchId = slash === -1 ? after : after.slice(0, slash);
  return { marker, batchId };
}

function jsonFieldCapped(value: unknown, max: number): string {
  try {
    let j = JSON.stringify(value);
    if (j.length > max) j = `${j.slice(0, max)}…`;
    return j;
  } catch {
    return "";
  }
}

function numOrEmpty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(n);
}

/**
 * Builds UTF-8 CSV text (including BOM) for the current job plan.
 * Trailing columns repeat job-level import/snapshot telemetry on every row so a filtered slice
 * of files still carries full context (schema version, export time, Drive/Gmail fetch stats, IDs).
 * Used by {@link downloadJobPlanCsv} and tests.
 */
export function buildJobPlanCsvText(job: Job): string {
  const dry = job.config?.dry_run ? "yes" : "no";
  const model = job.config?.model ?? "";
  const language = job.config?.language ?? "";
  const minConf =
    job.config?.min_confidence != null ? String(job.config.min_confidence) : "";

  const headers = [
    "job_id",
    "session_id",
    "job_file_index",
    "source_path",
    "filename",
    "gmail_staged_part",
    "status",
    "target_folder",
    "suggested_folder",
    "llm_folder_name",
    "classification_disagree",
    "confidence",
    "llm_confidence",
    "rerank_top_score",
    "candidate_margin_top12",
    "candidate_1_folder",
    "candidate_1_score",
    "candidate_2_folder",
    "candidate_2_score",
    "candidate_3_folder",
    "candidate_3_score",
    "candidates_json",
    "decision_reason",
    "primary_purpose",
    "llm_reason",
    "detected_language",
    "document_briefing_snippet",
    "classify_audit_json",
    "job_structure_template_enabled",
    "structure_active",
    "structure_parse_failed",
    "structure_values_json",
    "structure_path_provisional",
    "structure_auto_tail",
    "structure_cap_rewritten",
    "structure_rerank_skipped",
    "decision_trace",
    "analyze_duration_ms",
    "analyze_extract_ms",
    "analyze_briefing_ms",
    "analyze_classify_ms",
    "reason",
    "rule_id",
    "extraction_source",
    "extraction_quality",
    "ocr_used",
    "page_count",
    "filename_tokens",
    "analysis_excerpt_snippet",
    "error",
    "dest_path",
    "job_model",
    "job_language",
    "job_min_confidence",
    "dry_run",
    "gmail_query",
    "gmail_list_query",
    "gmail_max_messages",
    "gmail_import_content",
    "gmail_import_fetching",
    "gmail_export_messages",
    "gmail_export_text_files",
    "gmail_export_attachment_files",
    "gmail_export_attachment_fetch_failures",
    "gmail_export_staging_capped",
    "gmail_ui_parameters_json",
    "sort_plan_csv_schema_version",
    "csv_exported_at_utc",
    "job_phase",
    "job_overall_status",
    "job_level_error",
    "job_worker_active",
    "job_total",
    "job_completed",
    "job_last_processed_index",
    "job_created_at_ms",
    "job_updated_at_ms",
    "gmail_messages_total_estimate",
    "drive_import_fetching",
    "drive_listing_discovered",
    "drive_files_in_source",
    "drive_import_fetch_failures",
    "drive_import_failed_file_ids_json",
    "import_fetch_failures_gmail_plus_drive",
    "file_entry_id",
    "file_size_bytes",
    "import_staging_folder_marker",
    "import_staging_batch_id",
  ];
  const gq = job.gmail_query ?? "";
  const glq = job.gmail_list_query ?? "";
  const gmm = job.gmail_max_messages != null ? String(job.gmail_max_messages) : "";
  const gic = job.gmail_import_content ?? "";
  const gif = job.gmail_import_fetching === true ? "true" : job.gmail_import_fetching === false ? "false" : "";
  const gem = job.gmail_export_messages != null ? String(job.gmail_export_messages) : "";
  const gtf = job.gmail_export_text_files != null ? String(job.gmail_export_text_files) : "";
  const gaf = job.gmail_export_attachment_files != null ? String(job.gmail_export_attachment_files) : "";
  const gaff = job.gmail_export_attachment_fetch_failures != null ? String(job.gmail_export_attachment_fetch_failures) : "";
  const gsc = job.gmail_export_staging_capped === true ? "true" : job.gmail_export_staging_capped === false ? "false" : "";
  const guij = job.gmail_ui_parameters_json != null && job.gmail_ui_parameters_json !== "" ? job.gmail_ui_parameters_json : "";
  const csvExportedAtUtc = new Date().toISOString();
  const gmailListEstimate = numOrEmpty(job.gmail_messages_total_estimate ?? undefined);
  const driveFetching = boolCsv(job.drive_import_fetching);
  const driveListing = numOrEmpty(job.drive_listing_discovered);
  const driveInSource = numOrEmpty(job.drive_files_in_source);
  const driveFetchFails = job.drive_import_fetch_failures != null ? String(job.drive_import_fetch_failures) : "";
  const driveFailedIdsJson = escapeCsv(
    jsonFieldCapped(job.drive_import_failed_file_ids ?? [], DRIVE_FAILED_IDS_JSON_MAX)
  );
  const gmailFailN = job.gmail_export_attachment_fetch_failures ?? 0;
  const driveFailN = job.drive_import_fetch_failures ?? 0;
  const importFetchSum = String(gmailFailN + driveFailN);
  const jobStructureEnabled = jobStructureTemplateEnabled(job);

  const lines = [headers.join(",")];

  job.files.forEach((f, idx) => {
    const staging = importStagingHint(f.path);
    const ranked = candidateRanked(f.candidate_scores);
    const [c1f, c1s] = topCandidate(ranked, 0);
    const [c2f, c2s] = topCandidate(ranked, 1);
    const [c3f, c3s] = topCandidate(ranked, 2);
    const signals = f.extraction_signals as Record<string, unknown> | undefined;
    const ocrUsed = signals?.ocr_used;

    const row = [
      escapeCsv(job.id),
      escapeCsv(job.session_id ?? ""),
      String(idx + 1),
      escapeCsv(f.path),
      escapeCsv(f.name),
      f.gmail_staged_part ? escapeCsv(f.gmail_staged_part) : "",
      escapeCsv(f.status),
      escapeCsv((f.final_folder ?? f.suggested_folder) || ""),
      escapeCsv(f.suggested_folder ?? ""),
      escapeCsv(f.llm_folder_name ?? ""),
      boolCsv(f.classification_disagree ?? undefined),
      f.confidence != null ? String(f.confidence) : "",
      f.llm_confidence != null ? String(f.llm_confidence) : "",
      f.rerank_top_score != null ? String(f.rerank_top_score) : "",
      candidateMargin(ranked),
      escapeCsv(c1f),
      c1s,
      escapeCsv(c2f),
      c2s,
      escapeCsv(c3f),
      c3s,
      escapeCsv(candidatesJson(ranked)),
      escapeCsv(f.decision_reason ?? ""),
      escapeCsv(f.primary_purpose ?? ""),
      escapeCsv(f.llm_reason ?? ""),
      escapeCsv(f.detected_language ?? ""),
      escapeCsv(briefingSnippetForCsv(f.document_briefing ?? null)),
      escapeCsv(classifyAuditJson(f.decision_trace)),
      jobStructureEnabled,
      traceBool(f.decision_trace, "structure_template"),
      traceBool(f.decision_trace, "structure_parse_failed"),
      escapeCsv(structureValuesJson(f.structure_values)),
      escapeCsv(f.structure_path_provisional ?? ""),
      escapeCsv(traceString(f.decision_trace, "structure_auto_tail")),
      boolCsv(f.structure_cap_rewritten ?? undefined),
      traceBool(f.decision_trace, "structure_rerank_skipped"),
      escapeCsv(decisionTraceJson(f.decision_trace)),
      f.analyze_duration_ms != null ? String(f.analyze_duration_ms) : "",
      f.analyze_extract_ms != null ? String(f.analyze_extract_ms) : "",
      f.analyze_briefing_ms != null ? String(f.analyze_briefing_ms) : "",
      f.analyze_classify_ms != null ? String(f.analyze_classify_ms) : "",
      escapeCsv(f.reason ?? ""),
      escapeCsv(f.rule_applied_id ?? ""),
      escapeCsv(f.extraction_source ?? ""),
      f.extraction_quality != null ? String(f.extraction_quality) : "",
      typeof ocrUsed === "boolean" ? (ocrUsed ? "true" : "false") : "",
      signalsPageCount(signals),
      escapeCsv(filenameTokensPipe(signals)),
      escapeCsv(excerptForCsv(f.analysis_excerpt ?? null)),
      escapeCsv(f.error ?? ""),
      escapeCsv(f.dest_path ?? ""),
      escapeCsv(model),
      escapeCsv(language),
      minConf,
      dry,
      escapeCsv(gq),
      escapeCsv(glq),
      gmm,
      escapeCsv(gic),
      gif,
      gem,
      gtf,
      gaf,
      gaff,
      gsc,
      escapeCsv(guij),
      SORT_PLAN_CSV_SCHEMA_VERSION,
      escapeCsv(csvExportedAtUtc),
      escapeCsv(job.phase),
      escapeCsv(job.status),
      escapeCsv(job.error ?? ""),
      boolCsv(job.worker_active),
      String(job.total),
      String(job.completed),
      String(job.last_processed_index),
      numOrEmpty(job.created_at),
      numOrEmpty(job.updated_at),
      gmailListEstimate,
      driveFetching,
      driveListing,
      driveInSource,
      driveFetchFails,
      driveFailedIdsJson,
      importFetchSum,
      escapeCsv(f.entry_id ?? ""),
      f.size_bytes != null ? String(f.size_bytes) : "",
      escapeCsv(staging.marker),
      escapeCsv(staging.batchId),
    ];
    lines.push(row.join(","));
  });

  const BOM = "\uFEFF";
  return BOM + lines.join("\n");
}

/** Download the current job plan as CSV (paths, folders, confidence, diagnostics). */
export function downloadJobPlanCsv(job: Job): void {
  const text = buildJobPlanCsvText(job);
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sort-plan-${job.id.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
