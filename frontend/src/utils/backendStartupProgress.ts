export type BackendStartupProgressSample = {
  elapsedMs: number;
  maxWaitMs: number;
  percent: number;
};

/** Smooth cold-start percent between IPC polls using the last sampled elapsed time. */
export function computeStartupDisplayPercent(
  sample: BackendStartupProgressSample | null,
  sampledAtMs: number,
  now = Date.now(),
): number {
  if (!sample || sample.maxWaitMs <= 0) return 0;
  if (sample.percent >= 100) return 100;
  const elapsed = Math.min(
    sample.maxWaitMs,
    sample.elapsedMs + Math.max(0, now - sampledAtMs),
  );
  return Math.min(99, Math.round((elapsed / sample.maxWaitMs) * 100));
}
