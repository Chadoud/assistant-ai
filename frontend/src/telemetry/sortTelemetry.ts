import { track } from "./client";
import { TelemetryEventNames } from "./schema";

export type SortBlockReason =
  | "no_output_folder"
  | "offline"
  | "model_not_ready"
  | "entitlement_blocked"
  | "cloud_auth_required"
  | "local_paths_need_desktop"
  | "empty_selection";

const DEBOUNCE_KEY = "exosites.telemetry.sort_blocked.v1";

function blockedThisSession(reason: SortBlockReason): boolean {
  try {
    const raw = sessionStorage.getItem(DEBOUNCE_KEY);
    const set = raw ? (JSON.parse(raw) as string[]) : [];
    if (set.includes(reason)) return true;
    set.push(reason);
    sessionStorage.setItem(DEBOUNCE_KEY, JSON.stringify(set));
    return false;
  } catch {
    return false;
  }
}

/** Fire once per blocker reason per browser session. */
export function trackSortBlocked(
  optIn: boolean,
  locale: string,
  reason: SortBlockReason
): void {
  if (!optIn || blockedThisSession(reason)) return;
  track(optIn, locale, TelemetryEventNames.sortBlocked, { reason });
}
