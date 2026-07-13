import { track } from "./client";
import { countBucket, fileCountBucket } from "./buckets";
import { TelemetryEventNames } from "./schema";

const OPENED_KEY = "exosites.telemetry.review_opened.v1";

function openedThisSession(jobId: string): boolean {
  try {
    const raw = sessionStorage.getItem(OPENED_KEY);
    const set = raw ? (JSON.parse(raw) as string[]) : [];
    if (set.includes(jobId)) return true;
    set.push(jobId);
    sessionStorage.setItem(OPENED_KEY, JSON.stringify(set));
    return false;
  } catch {
    return false;
  }
}

/** Fire once per job when the review panel first appears. */
export function trackReviewOpened(
  optIn: boolean,
  locale: string,
  jobId: string,
  reviewRowCount: number
): void {
  if (!optIn || !jobId || openedThisSession(jobId)) return;
  track(optIn, locale, TelemetryEventNames.reviewOpened, {
    file_count_bucket: fileCountBucket(reviewRowCount),
  });
}

export function trackReviewBulkApplied(optIn: boolean, locale: string, approvedCount: number): void {
  if (!optIn || approvedCount <= 0) return;
  track(optIn, locale, TelemetryEventNames.reviewBulkApplied, {
    count_bucket: countBucket(approvedCount),
  });
}

export function trackReviewReassign(optIn: boolean, locale: string): void {
  if (!optIn) return;
  track(optIn, locale, TelemetryEventNames.reviewReassign, {
    count_bucket: "1",
  });
}

export function trackReviewDismissed(
  optIn: boolean,
  locale: string,
  pendingRowCount: number
): void {
  if (!optIn || pendingRowCount <= 0) return;
  track(optIn, locale, TelemetryEventNames.reviewDismissed, {
    file_count_bucket: fileCountBucket(pendingRowCount),
  });
}
