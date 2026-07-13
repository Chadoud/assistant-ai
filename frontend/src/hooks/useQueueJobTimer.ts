import { useEffect, useRef, useState } from "react";
import type { Job } from "../api";
import { formatDurationMs } from "../utils/format";

type UseQueueJobTimerOptions = {
  /**
   * When the user chose **Run sort** (workspace batch), wall-clock ms at click.
   * Elapsed time then includes import / fetch before the backend job exists.
   */
  sortRunStartedAtMs?: number | null;
};

/**
 * Wall-clock label for the current job (running vs frozen end time).
 * Mirrors QueuePanel timer semantics: tick only while status is ``running``.
 * If {@link UseQueueJobTimerOptions.sortRunStartedAtMs} is set, the start anchor
 * is the earlier of that and the job’s `created_at` (so prep time is included).
 */
export function useQueueJobTimer(
  currentJob: Job | null,
  options?: UseQueueJobTimerOptions | null
): string | null {
  const [elapsedTick, setElapsedTick] = useState(0);
  /** Wall-clock ms for "running" duration; updated in the 1s interval (not Date.now() in render). */
  const nowMsRef = useRef(0);
  const jobFrozenAtRef = useRef<number | null>(null);
  const jobPrevActiveRef = useRef(false);
  const jobTimerIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const jobActiveForTimer = currentJob?.status === "running";

  useEffect(() => {
    if (!currentJob?.id) {
      jobFrozenAtRef.current = null;
      jobPrevActiveRef.current = false;
      return;
    }
    jobFrozenAtRef.current = null;
    jobPrevActiveRef.current = false;
  }, [currentJob?.id]);

  useEffect(() => {
    if (!currentJob?.id) return;
    const active = currentJob.status === "running";
    if (jobPrevActiveRef.current && !active) {
      const t = Date.now();
      jobFrozenAtRef.current = t;
      nowMsRef.current = t;
      setElapsedTick((n) => n + 1);
    }
    if (active) {
      jobFrozenAtRef.current = null;
    }
    jobPrevActiveRef.current = active;
  }, [currentJob?.id, currentJob?.status]);

  useEffect(() => {
    if (jobTimerIdRef.current) {
      clearInterval(jobTimerIdRef.current);
      jobTimerIdRef.current = null;
    }
    if (!currentJob?.id || !jobActiveForTimer) return;
    nowMsRef.current = Date.now();
    jobTimerIdRef.current = setInterval(() => {
      nowMsRef.current = Date.now();
      setElapsedTick((n) => n + 1);
    }, 1000);
    return () => {
      if (jobTimerIdRef.current) {
        clearInterval(jobTimerIdRef.current);
        jobTimerIdRef.current = null;
      }
    };
  }, [currentJob?.id, jobActiveForTimer]);

  if (
    currentJob == null ||
    typeof currentJob.created_at !== "number" ||
    currentJob.created_at <= 0
  ) {
    return null;
  }

  void elapsedTick;
  const createdMs = currentJob.created_at * 1000;
  const prep = options?.sortRunStartedAtMs;
  /** Reject stale prep from an earlier run (e.g. job started from another path). */
  const maxPrepBeforeJobMs = 15 * 60 * 1000;
  const canUsePrep =
    prep != null &&
    Number.isFinite(prep) &&
    prep > 0 &&
    createdMs - prep >= 0 &&
    createdMs - prep <= maxPrepBeforeJobMs;
  const startMs = canUsePrep ? Math.min(prep, createdMs) : createdMs;
  let endMs: number;
  if (jobActiveForTimer) {
    // Before the first interval tick, ref may still be 0 — show 0 elapsed vs start.
    endMs = nowMsRef.current > 0 ? nowMsRef.current : startMs;
  } else if (jobFrozenAtRef.current != null) {
    endMs = jobFrozenAtRef.current;
  } else if (typeof currentJob.updated_at === "number" && currentJob.updated_at >= currentJob.created_at) {
    endMs = currentJob.updated_at * 1000;
  } else {
    endMs = nowMsRef.current;
  }
  return formatDurationMs(endMs - startMs);
}
