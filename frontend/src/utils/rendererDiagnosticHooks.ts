/**
 * Forwards unhandled errors to the main process (written to userData renderer-diagnostics.log).
 * OOM / black-screen crashes may not run these handlers; `render-process-gone` in Electron still logs.
 */
export function installRendererDiagnosticHooks(): void {
  if (typeof window === "undefined") return;
  const log = window.electronAPI?.appendRendererDiagnostic;
  if (typeof log !== "function") return;
  window.addEventListener("error", (e) => {
    void log({
      kind: "error",
      message: String(e.message),
      source: e.filename,
      line: e.lineno,
      col: e.colno,
      errorName: e.error instanceof Error ? e.error.name : undefined,
      errorStack: e.error instanceof Error ? e.error.stack : undefined,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    void log({
      kind: "unhandledrejection",
      message: r instanceof Error ? r.message : String(r),
      errorStack: r instanceof Error ? r.stack : undefined,
    });
  });
}
