/**
 * Crash / error reporting: optional Sentry (``VITE_SENTRY_DSN``) and/or duplicate to local API
 * ``POST /v1/crash-reports`` when the backend exposes ``crash_reports_ingest_enabled`` (ingest API configured).
 */
import { useSyncExternalStore } from "react";
import {
  getBackendCrashIngestEnabled,
  initStandaloneCrashCapture,
  reportCrashToBackend,
  subscribeBackendCrashIngest,
  submitSentryEventToBackend,
  teardownStandaloneCrashCapture,
  type CrashSource,
} from "./crashBackendIngest";

let clientActive = false;
let initGeneration = 0;
let loadInFlight = false;
/** Live Sentry client once initialized — used to relay caught errors that bypass global handlers. */
let sentryApi: typeof import("@sentry/react") | null = null;
/** Latest user opt-in from Settings (``beforeSend`` also checks MySQL flag at send time). */
let crashReportsUserOptIn = false;

function scrubPathsInString(s: string | undefined): string | undefined {
  if (!s) return s;
  return s
    .replace(/[A-Za-z]:\\[^\s]*/g, "[path]")
    .replace(/\/(?:Users|home)\/[^\s]+/gi, "[path]");
}

function sentryDsn(): string | undefined {
  return (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim() || undefined;
}

export function syncCrashReporting(enabled: boolean): void {
  crashReportsUserOptIn = enabled;
  const dsn = sentryDsn();

  if (!enabled) {
    initGeneration += 1;
    teardownStandaloneCrashCapture();
    if (clientActive) {
      clientActive = false;
      sentryApi = null;
      void import("@sentry/react").then((Sentry) => Sentry.close(2000));
    }
    return;
  }

  if (dsn) {
    teardownStandaloneCrashCapture();
    if (clientActive || loadInFlight) return;

    loadInFlight = true;
    const generationAtStart = initGeneration;
    void import("@sentry/react")
      .then((Sentry) => {
        if (generationAtStart !== initGeneration) return;
        Sentry.init({
          dsn,
          environment: import.meta.env.MODE,
          sendDefaultPii: false,
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: 0,
          tracesSampleRate: 0,
          beforeSend(event) {
            if (event.user) {
              delete event.user;
            }
            if (event.request) {
              delete event.request.url;
              delete event.request.cookies;
              delete event.request.headers;
            }
            if (event.breadcrumbs?.length) {
              event.breadcrumbs = event.breadcrumbs.map((b) => ({
                ...b,
                message: scrubPathsInString(b.message),
                data:
                  b.data && typeof b.data === "object"
                    ? Object.fromEntries(
                        Object.entries(b.data as Record<string, unknown>).map(([k, v]) => [
                          k,
                          typeof v === "string" ? scrubPathsInString(v) : v,
                        ])
                      )
                    : b.data,
              }));
            }
            if (event.exception?.values) {
              for (const ex of event.exception.values) {
                if (ex.value) ex.value = scrubPathsInString(ex.value) ?? ex.value;
              }
            }
            if (crashReportsUserOptIn && getBackendCrashIngestEnabled()) {
              submitSentryEventToBackend(event);
            }
            return event;
          },
        });
        if (generationAtStart !== initGeneration) {
          void Sentry.close(2000);
          return;
        }
        clientActive = true;
        sentryApi = Sentry;
      })
      .finally(() => {
        loadInFlight = false;
      });
    return;
  }

  if (clientActive) {
    clientActive = false;
    sentryApi = null;
    void import("@sentry/react").then((Sentry) => Sentry.close(2000));
  }

  if (getBackendCrashIngestEnabled()) {
    initStandaloneCrashCapture();
  } else {
    teardownStandaloneCrashCapture();
  }
}

/**
 * Report a caught error that would otherwise bypass the global capture path
 * (e.g. React render errors swallowed by an ErrorBoundary, or errors relayed
 * from the Electron main process).
 *
 * Respects the user's Privacy opt-out. When Sentry is active its `beforeSend`
 * duplicates the event to the crash DB; otherwise we POST to the backend directly.
 *
 * @param source Crash origin tag persisted in the DB.
 * @param error The caught error (or any thrown value).
 * @param extraDetail Optional context appended to the stack trace (e.g. React component stack).
 */
export function reportHandledError(
  source: CrashSource,
  error: unknown,
  extraDetail?: string
): void {
  if (!crashReportsUserOptIn) return;

  if (clientActive && sentryApi) {
    sentryApi.captureException(error, extraDetail ? { extra: { detail: extraDetail } } : undefined);
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  const baseStack = error instanceof Error && error.stack ? error.stack : "";
  const stack = extraDetail ? `${baseStack}\n\n${extraDetail}`.trim() : baseStack || null;
  reportCrashToBackend(source, message, stack);
}

/** True when this build or backend can collect crashes (Sentry DSN and/or MySQL ingest behind the API). */
export function isCrashReportingConfigured(): boolean {
  return Boolean(sentryDsn()) || getBackendCrashIngestEnabled();
}

/** Whether the user opted in to crash reporting under Privacy settings. */
export function isCrashReportsUserOptIn(): boolean {
  return crashReportsUserOptIn;
}

/** True when the Sentry client is initialized and will receive {@link reportHandledError}. */
export function isSentryCrashClientActive(): boolean {
  return clientActive;
}

/**
 * Subscribes to backend ingest flag updates so Privacy copy matches after ``client-config`` loads.
 * Build-time Sentry DSN is read synchronously; server-side ingest may flip after fetch.
 */
export function useIsCrashReportingConfigured(): boolean {
  return useSyncExternalStore(
    subscribeBackendCrashIngest,
    () => Boolean(sentryDsn()) || getBackendCrashIngestEnabled(),
    () => Boolean(sentryDsn())
  );
}
