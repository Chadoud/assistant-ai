import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  logCrashIngestFailure,
  notifyCrashIngestFailureOnce,
  resetCrashIngestFailureNotifyForTests,
} from "./crashIngestDiagnostics";

describe("crashIngestDiagnostics", () => {
  beforeEach(() => {
    resetCrashIngestFailureNotifyForTests();
    vi.restoreAllMocks();
  });

  it("logs crash ingest failure via electron diagnostics when available", () => {
    const append = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("window", {
      electronAPI: { appendRendererDiagnostic: append },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    logCrashIngestFailure("network error");

    expect(append).toHaveBeenCalledOnce();
    expect(append.mock.calls[0][0].kind).toBe("crash_ingest_failed");
    expect(warn).toHaveBeenCalled();
  });

  it("dispatches exo:crash-ingest-failed only once per session", () => {
    vi.stubGlobal("window", {
      electronAPI: undefined,
      dispatchEvent: vi.fn(),
    });
    const dispatch = window.dispatchEvent as ReturnType<typeof vi.fn>;

    notifyCrashIngestFailureOnce("502");
    notifyCrashIngestFailureOnce("502 again");

    expect(dispatch).toHaveBeenCalledOnce();
  });
});
