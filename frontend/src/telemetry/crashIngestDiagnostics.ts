/**
 * Diagnostics when opted-in crash ingest fails to reach the server.
 */

type CrashIngestFailurePayload = {
  kind: "crash_ingest_failed";
  message: string;
  at: string;
};

/** Append a crash-ingest failure line to renderer diagnostics (Electron). */
export function logCrashIngestFailure(reason: string): void {
  const payload: CrashIngestFailurePayload = {
    kind: "crash_ingest_failed",
    message: reason.slice(0, 500),
    at: new Date().toISOString(),
  };
  void window.electronAPI?.appendRendererDiagnostic?.(payload);
  console.warn("[crash-ingest]", payload.message);
}

let failureToastShown = false;

/** Notify once per session when passive crash ingest fails (opt-in builds). */
export function notifyCrashIngestFailureOnce(reason: string): void {
  logCrashIngestFailure(reason);
  if (failureToastShown || typeof window === "undefined") return;
  failureToastShown = true;
  window.dispatchEvent(
    new CustomEvent("exo:crash-ingest-failed", { detail: { message: reason.slice(0, 200) } }),
  );
}

/** Test-only reset for toast deduplication. */
export function resetCrashIngestFailureNotifyForTests(): void {
  failureToastShown = false;
}
