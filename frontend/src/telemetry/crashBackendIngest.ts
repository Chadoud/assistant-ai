/**
 * Crash forwarding. Two delivery modes:
 *
 *  1. Direct public endpoint (preferred for distributed builds): when
 *     ``VITE_CRASH_INGEST_URL`` + ``VITE_CRASH_INGEST_TOKEN`` are set, reports POST
 *     straight to that HTTPS endpoint (e.g. the PHP receiver that writes to the
 *     central MySQL). This is how crashes from ANY user's machine reach the DB —
 *     the DB itself is not reachable from clients.
 *  2. Fallback: the local FastAPI ``POST /v1/crash-reports`` when no direct endpoint
 *     is configured and ``GET /v1/public/client-config`` reports ingest enabled.
 */

import { getApiHeaders } from "../api/client";
import { desktopClient } from "../desktopClient";
import { APP_VERSION_LABEL } from "../constants";
import { notifyCrashIngestFailureOnce } from "./crashIngestDiagnostics";
import { buildEnrichedCrashFields } from "./buildCrashReport";
import { getActiveConversationId } from "../systemCommands/activeConversationRef";

const DIRECT_CRASH_INGEST_URL =
  (import.meta.env.VITE_CRASH_INGEST_URL as string | undefined)?.trim() ?? "";
const DIRECT_CRASH_INGEST_TOKEN =
  (import.meta.env.VITE_CRASH_INGEST_TOKEN as string | undefined)?.trim() ?? "";

/** True when a public crash endpoint + token are baked into this build. */
export const directCrashIngestConfigured = Boolean(
  DIRECT_CRASH_INGEST_URL && DIRECT_CRASH_INGEST_TOKEN
);

let backendCrashIngestEnabled = false;
/** UI locale for crash rows (no PII). */
let crashUiLocale = "en";

type CrashIngestListener = () => void;
const crashIngestListeners = new Set<CrashIngestListener>();

function notifyCrashIngestListeners(): void {
  for (const listener of crashIngestListeners) {
    try {
      listener();
    } catch {
      /* subscriber fault must not break others */
    }
  }
}

/** For ``useSyncExternalStore`` / UI that must re-render when ingest flag changes. */
export function subscribeBackendCrashIngest(listener: CrashIngestListener): () => void {
  crashIngestListeners.add(listener);
  return () => crashIngestListeners.delete(listener);
}

export function setBackendCrashIngestEnabled(v: boolean): void {
  if (backendCrashIngestEnabled === v) return;
  backendCrashIngestEnabled = v;
  notifyCrashIngestListeners();
}

export function getBackendCrashIngestEnabled(): boolean {
  return backendCrashIngestEnabled;
}

export function setCrashReportUiLocale(locale: string): void {
  crashUiLocale = (locale || "en").slice(0, 32);
}

function scrubPathsInString(s: string): string {
  return s
    .replace(/[A-Za-z]:\\[^\s]*/g, "[path]")
    .replace(/\/(?:Users|home)\/[^\s]+/gi, "[path]");
}

/**
 * Origin of a crash row. The renderer posts to the local backend, which forwards
 * to the central ingest API (api.exosites.ch) over X-Crash-Token.
 */
export type CrashSource =
  | "sentry_renderer"
  | "window_error"
  | "unhandledrejection"
  | "react_error_boundary"
  | "main_process";

type CrashReportPayload = {
  app_version: string;
  environment: string;
  ui_locale?: string | null;
  platform?: string | null;
  source: CrashSource;
  error_message: string;
  stack_trace?: string | null;
  instance_id?: string | null;
  session_id?: string | null;
  source_detail?: string | null;
  active_feature?: string | null;
  active_tab?: string | null;
  last_events_json?: string | null;
  intent_bucket?: string | null;
  tool_name?: string | null;
  llm_provider?: string | null;
  llm_error_class?: string | null;
  conversation_id_hash?: string | null;
  dedupe_key?: string | null;
  sentry_event_id?: string | null;
};

function withEnrichedCrashFields(
  payload: CrashReportPayload,
  enrich: boolean,
): CrashReportPayload {
  if (!enrich) return payload;
  const extra = buildEnrichedCrashFields(
    payload.source,
    payload.error_message,
    getActiveConversationId(),
  );
  return {
    ...payload,
    instance_id: extra.instance_id,
    session_id: extra.session_id,
    active_feature: extra.active_feature,
    active_tab: extra.active_tab,
    last_events_json: extra.last_events_json,
    intent_bucket: extra.intent_bucket,
    tool_name: extra.tool_name,
    conversation_id_hash: extra.conversation_id_hash,
    dedupe_key: extra.dedupe_key,
  };
}

function serializeCrashPayload(payload: CrashReportPayload): string {
  return JSON.stringify({
    app_version: payload.app_version.slice(0, 64),
    environment: payload.environment.slice(0, 32),
    ui_locale: payload.ui_locale ? payload.ui_locale.slice(0, 32) : null,
    platform: payload.platform ? payload.platform.slice(0, 512) : null,
    source: payload.source,
    error_message: scrubPathsInString(payload.error_message).slice(0, 8000),
    stack_trace: payload.stack_trace
      ? scrubPathsInString(payload.stack_trace).slice(0, 65000)
      : null,
    instance_id: payload.instance_id?.slice(0, 128) ?? null,
    session_id: payload.session_id?.slice(0, 128) ?? null,
    source_detail: payload.source_detail?.slice(0, 64) ?? null,
    active_feature: payload.active_feature?.slice(0, 64) ?? null,
    active_tab: payload.active_tab?.slice(0, 64) ?? null,
    last_events_json: payload.last_events_json?.slice(0, 16_384) ?? null,
    intent_bucket: payload.intent_bucket?.slice(0, 64) ?? null,
    tool_name: payload.tool_name?.slice(0, 64) ?? null,
    llm_provider: payload.llm_provider?.slice(0, 32) ?? null,
    llm_error_class: payload.llm_error_class?.slice(0, 32) ?? null,
    conversation_id_hash: payload.conversation_id_hash?.slice(0, 64) ?? null,
    dedupe_key: payload.dedupe_key?.slice(0, 64) ?? null,
    sentry_event_id: payload.sentry_event_id?.slice(0, 64) ?? null,
  });
}

/**
 * Report an already-caught error to the crash DB with the standard envelope
 * (app version, environment, locale, platform) filled in. Fire-and-forget and
 * gated on backend ingest being enabled.
 *
 * Callers that have access to a live Sentry client should prefer
 * {@link reportHandledError} in `sentry.ts`, which respects opt-in and avoids
 * duplicate sends.
 */
export function reportCrashToBackend(
  source: CrashSource,
  errorMessage: string,
  stackTrace?: string | null
): void {
  submitCrashReportToBackend({
    app_version: APP_VERSION_LABEL,
    environment: import.meta.env.MODE,
    ui_locale: crashUiLocale,
    platform: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 512) : null,
    source,
    error_message: errorMessage || "unknown_error",
    stack_trace: stackTrace ?? null,
  });
}

function submitCrashReportToBackend(payload: CrashReportPayload): void {
  if (!backendCrashIngestEnabled) return;
  const enriched = withEnrichedCrashFields(payload, true);
  const body = serializeCrashPayload(enriched);
  void (async () => {
    try {
      if (directCrashIngestConfigured) {
        // Straight to the public endpoint with the shared token — no local backend.
        const res = await fetch(DIRECT_CRASH_INGEST_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Crash-Token": DIRECT_CRASH_INGEST_TOKEN,
          },
          body,
          keepalive: true,
        });
        if (!res.ok) {
          notifyCrashIngestFailureOnce(`direct_ingest_${res.status}`);
        }
        return;
      }
      const headers = await getApiHeaders({ "Content-Type": "application/json" });
      const res = await desktopClient.postCrashReport(body, headers as Record<string, string>);
      if (!res.ok) {
        notifyCrashIngestFailureOnce(`backend_ingest_${res.status}`);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "ingest_unreachable";
      notifyCrashIngestFailureOnce(reason);
    }
  })();
}

/**
 * Submit a user-initiated report and tell the caller whether it actually went through.
 *
 * Unlike {@link submitCrashReportToBackend} (fire-and-forget, gated on passive ingest),
 * this is for an explicit "report a problem" click — e.g. when the local app service is
 * down. It prefers the direct public endpoint (works without the local backend) and
 * awaits the result so the UI can be honest about success or failure.
 *
 * @returns `true` if the report was accepted, `false` if it couldn't be sent.
 */
export async function submitManualCrashReport(payload: CrashReportPayload): Promise<boolean> {
  const enriched = withEnrichedCrashFields(payload, true);
  const body = serializeCrashPayload(enriched);

  if (directCrashIngestConfigured) {
    try {
      const res = await fetch(DIRECT_CRASH_INGEST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Crash-Token": DIRECT_CRASH_INGEST_TOKEN,
        },
        body,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // No public endpoint baked in — fall back to the local API (likely down in the
  // offline case, but try anyway so a transient blip can still report).
  try {
    const headers = await getApiHeaders({ "Content-Type": "application/json" });
    const res = await desktopClient.postCrashReport(body, headers as Record<string, string>);
    return res.ok;
  } catch {
    return false;
  }
}

type SentryLikeEvent = {
  message?: string;
  exception?: {
    values?: Array<{
      value?: string;
      stacktrace?: { frames?: Array<{ filename?: string; function?: string; lineno?: number }> };
    }>;
  };
};

export function submitSentryEventToBackend(event: SentryLikeEvent): void {
  if (!backendCrashIngestEnabled) return;
  const values = event.exception?.values;
  const first = values?.[0];
  const message = (first?.value || event.message || "unknown_error").slice(0, 8000);
  const frames = first?.stacktrace?.frames;
  const stack =
    frames && frames.length > 0
      ? frames
          .slice(-40)
          .map((f) => `${f.filename ?? "?"}:${f.lineno ?? 0} ${f.function ?? ""}`)
          .join("\n")
      : undefined;
  submitCrashReportToBackend({
    app_version: APP_VERSION_LABEL,
    environment: import.meta.env.MODE,
    ui_locale: crashUiLocale,
    platform: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 512) : null,
    source: "sentry_renderer",
    error_message: message,
    stack_trace: stack ?? null,
  });
}

let standaloneCleanup: (() => void) | null = null;

export function teardownStandaloneCrashCapture(): void {
  standaloneCleanup?.();
  standaloneCleanup = null;
}

export function initStandaloneCrashCapture(): void {
  teardownStandaloneCrashCapture();
  if (!backendCrashIngestEnabled || typeof window === "undefined") return;

  const onError = (ev: ErrorEvent) => {
    const msg = String(ev.message || "error").slice(0, 8000);
    const stack =
      ev.error instanceof Error && typeof ev.error.stack === "string"
        ? ev.error.stack.slice(0, 65000)
        : null;
    submitCrashReportToBackend({
      app_version: APP_VERSION_LABEL,
      environment: import.meta.env.MODE,
      ui_locale: crashUiLocale,
      platform: navigator.userAgent.slice(0, 512),
      source: "window_error",
      error_message: msg,
      stack_trace: stack,
    });
  };

  const onRejection = (ev: PromiseRejectionEvent) => {
    const reason = ev.reason;
    const msg = (reason instanceof Error ? reason.message : String(reason)).slice(0, 8000);
    const stack =
      reason instanceof Error && typeof reason.stack === "string"
        ? reason.stack.slice(0, 65000)
        : null;
    submitCrashReportToBackend({
      app_version: APP_VERSION_LABEL,
      environment: import.meta.env.MODE,
      ui_locale: crashUiLocale,
      platform: navigator.userAgent.slice(0, 512),
      source: "unhandledrejection",
      error_message: msg,
      stack_trace: stack,
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  standaloneCleanup = () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
