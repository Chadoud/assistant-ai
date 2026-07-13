import { useEffect } from "react";
import { TelemetryEventNames } from "./schema";
import { track, flushTelemetry } from "./client";

const HEARTBEAT_STORAGE_KEY = "exosites.telemetry.heartbeat.v1";
const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;

function lastHeartbeatMs(): number {
  try {
    const raw = localStorage.getItem(HEARTBEAT_STORAGE_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function markHeartbeatSent(): void {
  try {
    localStorage.setItem(HEARTBEAT_STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Once per 24h while the app is open — improves last-seen without per-minute noise. */
export function useTelemetryHeartbeat(optIn: boolean, locale: string): void {
  useEffect(() => {
    if (!optIn) return;
    const now = Date.now();
    if (now - lastHeartbeatMs() < HEARTBEAT_INTERVAL_MS) return;
    track(optIn, locale, TelemetryEventNames.appHeartbeat, {});
    flushTelemetry(optIn, locale);
    markHeartbeatSent();
  }, [optIn, locale]);
}
