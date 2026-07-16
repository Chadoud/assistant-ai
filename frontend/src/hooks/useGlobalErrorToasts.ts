import { useEffect } from "react";
import { toast } from "sonner";
import type { UiLocale } from "../i18n/locale";
import { translate } from "../i18n/translate";
import { reportHandledError } from "../telemetry/sentry";

/**
 * Errors that are benign, already surfaced elsewhere (offline strip, feature toasts),
 * or pure noise. We don't pop a toast for these so the surface stays trustworthy.
 */
const IGNORED_PATTERNS: RegExp[] = [
  /resizeobserver loop/i,
  /aborterror/i,
  /the operation was aborted/i,
  /non-error promise rejection/i,
  /^script error\.?$/i,
  /load failed/i,
  /networkerror/i,
  /failed to fetch/i,
];

/** Don't re-toast the same message within this window, even if it fires repeatedly. */
const SAME_MESSAGE_COOLDOWN_MS = 8000;
/** Floor between any two error toasts to avoid storms drowning the UI. */
const GLOBAL_MIN_INTERVAL_MS = 3500;

function isIgnorable(message: string): boolean {
  if (!message.trim()) return true;
  return IGNORED_PATTERNS.some((re) => re.test(message));
}

/** Stable key so repeated identical errors coalesce into one toast slot. */
function toastIdFor(message: string): string {
  return `global-error:${message.slice(0, 120)}`;
}

type MainProcessErrorPayload = {
  message?: string;
  stack?: string | null;
  /** Main classified expected updater/crypto noise — log/report only, no toast. */
  benign?: boolean;
};

/**
 * Single hub that turns otherwise-silent unhandled errors into an honest, debounced
 * user-facing toast — without double-reporting (renderer capture already forwards to
 * the crash DB). It also relays Electron main-process crashes, which never reach the
 * renderer's own error handlers, into both the report pipeline and a toast.
 *
 * Mount once near the app root. Takes the locale directly (rather than `useI18n`) so
 * it can run at the `App` level, above the i18n provider it renders.
 */
export function useGlobalErrorToasts(uiLocale: UiLocale): void {
  useEffect(() => {
    const t = (key: string) => translate(uiLocale, key);

    let lastToastAt = 0;
    const lastByMessage = new Map<string, number>();

    const notify = (rawMessage: string) => {
      const message = (rawMessage || "").slice(0, 300);
      if (isIgnorable(message)) return;

      const now = Date.now();
      const previous = lastByMessage.get(message);
      if (previous && now - previous < SAME_MESSAGE_COOLDOWN_MS) return;
      if (now - lastToastAt < GLOBAL_MIN_INTERVAL_MS) return;

      lastByMessage.set(message, now);
      lastToastAt = now;

      // Raw exception text is for the console/crash pipeline, never the toast —
      // users get a plain-language message (the details live in diagnostics).
      console.error("[global-error-toast]", message);
      toast.error(t("errors.unexpectedTitle"), {
        id: toastIdFor(message),
        description: t("errors.unexpectedBody"),
        duration: 9000,
        action: {
          label: t("errors.reload"),
          onClick: () => window.location.reload(),
        },
      });
    };

    const onError = (ev: ErrorEvent) => notify(String(ev.message ?? ""));
    const onRejection = (ev: PromiseRejectionEvent) => {
      const reason = ev.reason;
      notify(reason instanceof Error ? reason.message : String(reason ?? ""));
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    // Electron main-process crashes are relayed here: report them (renderer respects
    // opt-in and owns the DB/Sentry path) and tell the user the background service hiccuped.
    const onMainError = (payload: MainProcessErrorPayload) => {
      if (payload?.benign) return;
      const message = (payload?.message || "Background service error").slice(0, 300);
      reportHandledError("main_process", new Error(message), payload?.stack ?? undefined);
      const now = Date.now();
      if (now - lastToastAt < GLOBAL_MIN_INTERVAL_MS) return;
      lastToastAt = now;
      toast.error(t("errors.mainProcessTitle"), {
        id: "main-process-error",
        description: t("errors.mainProcessBody"),
        duration: 9000,
        action: { label: t("errors.reload"), onClick: () => window.location.reload() },
      });
    };

    const unsubscribeMain = window.electronAPI?.onMainProcessError?.(onMainError);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      unsubscribeMain?.();
    };
  }, [uiLocale]);
}
