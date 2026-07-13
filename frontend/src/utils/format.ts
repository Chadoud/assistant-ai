/** String formatting utilities. */

import { CONFIDENCE_HIGH, CONFIDENCE_LOW, UNCERTAIN_FOLDER } from "../constants";

/**
 * Formats integers >= 1_000 with an apostrophe between thousands (e.g. 28_151 -> "28'151").
 * Values below 1_000 are unchanged. Non-finite values return a simple string fallback.
 */
export function formatIntegerApostropheThousands(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const n = Math.trunc(value);
  if (Math.abs(n) < 1000) return String(n);
  const sign = n < 0 ? "-" : "";
  const s = String(Math.abs(n));
  const parts: string[] = [];
  for (let i = s.length; i > 0; i -= 3) {
    parts.unshift(s.slice(Math.max(0, i - 3), i));
  }
  return sign + parts.join("'");
}

/** Human-readable byte size for disk / model cache. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const digits = n >= 10 || i === 0 ? 1 : 2;
  return `${n.toFixed(digits)} ${units[i]}`;
}

/** Plain-language match for ReviewTable / sort plan (same thresholds as confidence colors). */

type TFn = (key: string, vars?: Record<string, string | number>) => string;

/** Localized confidence chip label (use in UI with `useI18n`). */
export function confidenceLabelI18n(confidence: number, t: TFn): string {
  if (confidence >= CONFIDENCE_HIGH) return t("queue.confidenceHigh");
  if (confidence >= CONFIDENCE_LOW) return t("queue.confidenceMedium");
  return t("queue.confidenceLow");
}

/** Localized folder title: Uncertain bucket + spaced PascalCase per path segment (supports Parent/Child). */
export function folderDisplayLabel(folder: string, t: TFn): string {
  const f = (folder ?? "").trim();
  if (!f) return "—";
  if (f === UNCERTAIN_FOLDER) return t("queue.metricUncertain");
  return f
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => formatFolderDisplay(segment.trim()))
    .filter(Boolean)
    .join(" › ");
}

/** Insert spaces between PascalCase / camelCase segments for compact folder ids (e.g. `MilitaryService` → `Military Service`). */
function formatFolderDisplay(name: string): string {
  const s = (name ?? "").trim();
  if (s.length < 2) return s;
  return s
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

/** Format milliseconds as M:SS or H:MM:SS for job timers. */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Single-file analyze time (extract + model classify), from API `analyze_duration_ms`.
 *
 * @returns Sub-second as whole milliseconds; under one minute as whole seconds; otherwise minutes
 *   and seconds (hours when needed).
 */
export function formatAnalyzeDurationMs(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec} s`;
  const seconds = totalSec % 60;
  const totalMinutes = Math.floor(totalSec / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}
