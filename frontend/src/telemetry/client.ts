import { API_BASE } from "../api";
import { getApiHeaders } from "../api/client";
import { APP_VERSION_LABEL } from "../constants";
import {
  TELEMETRY_SCHEMA_VERSION,
  type FeedbackPayload,
  telemetryBatchSchema,
  feedbackSchema,
  uiEventItemSchema,
  type TelemetryEventName,
} from "./schema";
import { getOrCreateTelemetryInstanceId } from "./instanceId";
import { getOrCreateSessionId } from "./sessionId";
import { assertSafeTrackProps } from "./redact";

const BATCH_MAX = 20;
const FLUSH_MS = 15_000;
const ENDPOINT = `${API_BASE}/v1/telemetry/events`;
const FEEDBACK_ENDPOINT = `${API_BASE}/v1/telemetry/feedback`;

type QueuedEvent = {
  v: typeof TELEMETRY_SCHEMA_VERSION;
  name: TelemetryEventName;
  props: Record<string, string | number | boolean>;
};

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function platform(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  if (ua.includes("Electron")) return "electron";
  return navigator.platform || "web";
}

function postTelemetryBatch(body: object): void {
  const bodyStr = JSON.stringify(body);
  const electron = typeof window !== "undefined" ? window.electronAPI : undefined;
  if (electron?.telemetrySendBatch) {
    // Electron main process handles auth header injection via telemetryQueue.js
    void electron.telemetrySendBatch(ENDPOINT, bodyStr);
    return;
  }
  // Web fallback: include app token header if running in a token-gated context.
  void (async () => {
    try {
      const headers = await getApiHeaders({ "Content-Type": "application/json" });
      await fetch(ENDPOINT, { method: "POST", headers, body: bodyStr, keepalive: true });
    } catch {
      /* Web build: no main queue — drop on failure */
    }
  })();
}

export function flushTelemetry(optIn: boolean, locale: string): void {
  if (!optIn || queue.length === 0) return;
  const instance_id = getOrCreateTelemetryInstanceId();
  const batch = telemetryBatchSchema.safeParse({
    instance_id,
    session_id: getOrCreateSessionId(),
    app_version: APP_VERSION_LABEL,
    platform: platform(),
    locale,
    client_ts_ms: Date.now(),
    events: queue,
  });
  queue = [];
  if (!batch.success) return;
  postTelemetryBatch(batch.data);
}

/** When the OS reports connectivity again, retry batches queued in the Electron main process. */
export function flushOfflineTelemetryQueue(): void {
  const electron = typeof window !== "undefined" ? window.electronAPI : undefined;
  if (electron?.telemetryFlushOffline) {
    void electron.telemetryFlushOffline();
  }
}

function scheduleFlush(optIn: boolean, locale: string): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushTelemetry(optIn, locale);
  }, FLUSH_MS);
}

type TrackProps = Record<string, string | number | boolean>;

/** Enqueue one UI event. No-op if optIn is false. */
export function track(
  optIn: boolean,
  locale: string,
  name: TelemetryEventName,
  props: TrackProps = {}
): void {
  if (!optIn) return;
  if (import.meta.env.DEV && !assertSafeTrackProps(props)) {
    console.warn("[telemetry] blocked unsafe props", props);
    return;
  }
  const item = { v: TELEMETRY_SCHEMA_VERSION, name, props };
  const parsed = uiEventItemSchema.safeParse(item);
  if (!parsed.success) return;
  queue.push(parsed.data as QueuedEvent);
  if (queue.length >= BATCH_MAX) {
    flushTelemetry(optIn, locale);
    return;
  }
  scheduleFlush(optIn, locale);
}

/** Feedback is independent of usage analytics — still rate-limited on the server. */
export async function submitFeedback(
  locale: string,
  payload: Omit<FeedbackPayload, "instance_id" | "locale" | "app_version">
): Promise<boolean> {
  const raw = {
    instance_id: getOrCreateTelemetryInstanceId(),
    locale,
    app_version: APP_VERSION_LABEL,
    ...payload,
  };
  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) return false;
  const bodyStr = JSON.stringify(parsed.data);
  const electron = typeof window !== "undefined" ? window.electronAPI : undefined;
  if (electron?.telemetrySubmitFeedback) {
    try {
      return await electron.telemetrySubmitFeedback(bodyStr);
    } catch {
      return false;
    }
  }
  try {
    const headers = await getApiHeaders({ "Content-Type": "application/json" });
    const res = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers,
      body: bodyStr,
    });
    return res.ok;
  } catch {
    return false;
  }
}
