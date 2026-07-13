/** Delay before clearing voice transcripts so late STT chunks can arrive. */
export const TRANSCRIPT_COMMIT_QUIESCENCE_MS = 600;

/** Extra wait on reconnect before committing a partial utterance. */
export const TRANSCRIPT_RECONNECT_WAIT_MS = 1500;

export type TranscriptResetTimer = ReturnType<typeof setTimeout> | null;

/**
 * Schedule clearing in-flight voice transcripts after a quiet period.
 * Cancels any prior scheduled reset.
 */
export function scheduleDelayedTranscriptReset(
  timerRef: { current: TranscriptResetTimer },
  delayMs: number,
  onReset: () => void,
): void {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
  }
  timerRef.current = setTimeout(() => {
    timerRef.current = null;
    onReset();
  }, delayMs);
}

/** Cancel a pending transcript reset (e.g. new STT chunk arrived). */
export function cancelDelayedTranscriptReset(timerRef: { current: TranscriptResetTimer }): void {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}
