/** Privacy-safe numeric buckets for product telemetry props. */

export function fileCountBucket(count: number): string {
  if (count <= 5) return "1-5";
  if (count <= 20) return "6-20";
  if (count <= 100) return "21-100";
  return "100+";
}

export function countBucket(count: number): string {
  if (count <= 1) return "1";
  if (count <= 5) return "2-5";
  if (count <= 20) return "6-20";
  return "21+";
}

/** Share of total expressed as a rate bucket (0–100%). */
export function rateBucket(numerator: number, denominator: number): string {
  if (denominator <= 0 || numerator <= 0) return "0%";
  const pct = (numerator / denominator) * 100;
  if (pct <= 10) return "1-10%";
  if (pct <= 30) return "11-30%";
  return "30%+";
}

export type JobOutcome = "clean" | "has_uncertain" | "has_failures" | "mixed";

export function jobOutcomeFromCounts(args: {
  uncertainCount: number;
  failedSortCount: number;
  failedFetchCount: number;
}): JobOutcome {
  const hasUncertain = args.uncertainCount > 0;
  const hasFailures = args.failedSortCount > 0 || args.failedFetchCount > 0;
  if (hasUncertain && hasFailures) return "mixed";
  if (hasUncertain) return "has_uncertain";
  if (hasFailures) return "has_failures";
  return "clean";
}
