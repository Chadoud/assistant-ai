import type { GmailAnalyzeSlice, Job } from "../api";
import type { SortJobSourceId } from "../components/queue/deriveSortJobSources";
import { deriveSortJobSources } from "../components/queue/deriveSortJobSources";
import { UNCERTAIN_FOLDER } from "../constants";
import type { AppSettings } from "../types/settings";
import { deriveJobView } from "../utils/jobView";
import { buildAnalyzeOcrPayload } from "../utils/tesseractLang";
import {
  fileCountBucket,
  jobOutcomeFromCounts,
  rateBucket,
  type JobOutcome,
} from "./buckets";

export type TelemetryJobSource = "local" | "drive" | "gmail" | "mixed" | "unknown";

export function inferTelemetryJobSource(sources: readonly SortJobSourceId[]): TelemetryJobSource {
  if (sources.length === 0) return "unknown";
  if (sources.length === 1) {
    const only = sources[0];
    if (only === "local") return "local";
    if (only === "gmail") return "gmail";
    return "drive";
  }
  return "mixed";
}

export function inferTelemetryJobSourceFromStart(args: {
  paths?: string[];
  gmailForRun?: GmailAnalyzeSlice | null;
  driveStream?: boolean;
}): TelemetryJobSource {
  const hasGmail = args.gmailForRun != null;
  const hasPaths = (args.paths?.length ?? 0) > 0;
  const hasDrive = args.driveStream === true;
  const kinds = [hasGmail, hasPaths, hasDrive].filter(Boolean).length;
  if (kinds === 0) return "unknown";
  if (kinds > 1) return "mixed";
  if (hasGmail) return "gmail";
  if (hasDrive) return "drive";
  return "local";
}

export function fileCountAtJobStart(paths: string[], gmailForRun: GmailAnalyzeSlice | null): number {
  if (paths.length > 0) return paths.length;
  const max = gmailForRun?.max_messages;
  if (typeof max === "number" && max > 0) return max;
  return 1;
}

export function isOcrEnabledForSort(
  settings: Pick<AppSettings, "ocrLanguages">,
  installedTesseractLangs: string[] | undefined
): boolean {
  const payload = buildAnalyzeOcrPayload(settings, installedTesseractLangs);
  return Boolean(payload.tesseract_auto && (payload.tesseract_langs?.length ?? 0) > 0);
}

export function countUncertainFiles(job: Job): number {
  const files = job.files ?? [];
  return files.filter((f) => {
    const classified =
      f.status === "review_ready" ||
      f.status === "applying" ||
      f.status === "done" ||
      (f.status === "error" && f.suggested_folder != null);
    if (!classified) return false;
    return f.suggested_folder === UNCERTAIN_FOLDER;
  }).length;
}

export type JobCompletedTelemetryProps = {
  tab: "queue";
  duration_bucket: string;
  source: TelemetryJobSource;
  file_count_bucket: string;
  uncertain_rate_bucket: string;
  failed_sort_bucket: string;
  failed_fetch_bucket: string;
  ocr_used: boolean;
  outcome: JobOutcome;
};

/** Returns null when the job has no files to report (skip telemetry). */
export function buildJobCompletedProps(
  job: Job,
  durationBucket: string,
  ocrUsed: boolean
): JobCompletedTelemetryProps | null {
  const { totalCount, failedFiles, fetchFailureCount } = deriveJobView(job);
  if (totalCount <= 0) return null;

  const uncertainCount = countUncertainFiles(job);
  const failedSortCount = failedFiles.length;
  const failedFetchCount = fetchFailureCount;

  return {
    tab: "queue",
    duration_bucket: durationBucket,
    source: inferTelemetryJobSource(deriveSortJobSources(job)),
    file_count_bucket: fileCountBucket(totalCount),
    uncertain_rate_bucket: rateBucket(uncertainCount, totalCount),
    failed_sort_bucket: rateBucket(failedSortCount, totalCount),
    failed_fetch_bucket: rateBucket(failedFetchCount, totalCount),
    ocr_used: ocrUsed,
    outcome: jobOutcomeFromCounts({ uncertainCount, failedSortCount, failedFetchCount }),
  };
}

export type JobStartedTelemetryProps = {
  tab: "queue";
  source: TelemetryJobSource;
  file_count_bucket: string;
  ocr_used: boolean;
};

export function buildJobStartedProps(args: {
  paths: string[];
  gmailForRun: GmailAnalyzeSlice | null;
  driveStream?: boolean;
  ocrUsed: boolean;
}): JobStartedTelemetryProps {
  return {
    tab: "queue",
    source: inferTelemetryJobSourceFromStart({
      paths: args.paths,
      gmailForRun: args.gmailForRun,
      driveStream: args.driveStream,
    }),
    file_count_bucket: fileCountBucket(fileCountAtJobStart(args.paths, args.gmailForRun)),
    ocr_used: args.ocrUsed,
  };
}
