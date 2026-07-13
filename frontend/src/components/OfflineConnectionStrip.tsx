import { useCallback, useState, type CSSProperties } from "react";
import { APP_VERSION_LABEL, SUPPORT_EMAIL } from "../constants";
import { useI18n } from "../i18n/I18nContext";
import { submitManualCrashReport } from "../telemetry/crashBackendIngest";

interface OfflineConnectionStripProps {
  onRetryBackend?: () => void | Promise<void>;
}

type ReportState = "idle" | "sending" | "sent" | "failed";

/**
 * Full-screen modal overlay shown when the backend API is unreachable.
 * Replaces the old flat banner for a more visible, actionable layout.
 */
export default function OfflineConnectionStrip({
  onRetryBackend,
}: OfflineConnectionStripProps) {
  const { t } = useI18n();
  const [reportState, setReportState] = useState<ReportState>("idle");

  // The Help button files a best-effort diagnostic report (the backend is down,
  // so this goes to the public crash endpoint when configured) and then surfaces
  // the support email so the user always has a way forward.
  const handleHelp = useCallback(async () => {
    if (reportState === "sending") return;
    setReportState("sending");
    const ok = await submitManualCrashReport({
      app_version: APP_VERSION_LABEL,
      environment: import.meta.env.MODE,
      ui_locale: typeof navigator !== "undefined" ? navigator.language : null,
      platform: typeof navigator !== "undefined" ? navigator.userAgent : null,
      source: "window_error",
      error_message: "App service unavailable (user opened Help from browser build).",
      stack_trace: null,
    });
    setReportState(ok ? "sent" : "failed");
  }, [reportState]);

  return (
    <div
      data-tour="offline-strip"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-title"
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-bg-card shadow-2xl overflow-hidden">

        {/* Header stripe */}
        <div className="flex items-center gap-3 px-6 py-4 bg-red-950/60 border-b border-red-900/40">
          {/* Pulsing dot */}
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
          <h2 id="offline-title" className="text-sm font-semibold text-red-300 tracking-wide uppercase">
            {t("api.stripHeadline")}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-text-primary leading-relaxed">
            {t("offlineStrip.detail")}
          </p>

          {/* Report status + support email (revealed after Help) */}
          {reportState !== "idle" && (
            <div className="rounded-lg border border-border bg-bg-secondary px-3 py-2.5 text-sm">
              {reportState === "sending" ? (
                <p className="text-muted">{t("offlineStrip.reportSending")}</p>
              ) : (
                <p className="text-text-primary leading-relaxed">
                  {reportState === "sent" ? t("offlineStrip.reportSent") : t("offlineStrip.reportFailed")}{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                      t("offlineStrip.reportEmailSubject"),
                    )}`}
                    className="font-medium text-accent underline-offset-2 hover:underline"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-bg-secondary/50">
          <button
            type="button"
            onClick={() => void handleHelp()}
            disabled={reportState === "sending"}
            className="text-sm font-medium px-4 py-2 rounded-xl border border-border bg-bg-card text-text-secondary hover:bg-hover-overlay hover:text-text-primary transition-colors disabled:opacity-60"
          >
            {t("offlineStrip.help")}
          </button>
          {typeof onRetryBackend === "function" && (
            <button
              type="button"
              onClick={() => void onRetryBackend()}
              className="text-sm font-semibold px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-colors shadow-sm"
            >
              {t("offlineStrip.retryApi")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
