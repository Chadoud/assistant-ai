import { isProductDebugEnabled } from "../../utils/productDebugAccess";

const PREFIX = "[ai:driveMerge]";

/**
 * Verbose console logging for Google Drive list/import during **Run sort**.
 * - In dev or for product admins: on by default.
 * - Otherwise: set `localStorage.setItem("aiDebugDriveMerge", "1")` and reload.
 */
export function isDriveMergeDebugOn(): boolean {
  try {
    if (import.meta.env.MODE === "test") return false;
    if (isProductDebugEnabled()) return true;
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem("aiDebugDriveMerge") === "1";
  } catch {
    return isProductDebugEnabled();
  }
}

/**
 * @param event Short label (e.g. `listPage`, `bfsSummary`, `resolveDone`).
 * @param data Optional JSON-serializable fields; avoid PII (paths are OK for local debug).
 */
export function driveMergeDebug(event: string, data?: Record<string, unknown>): void {
  if (!isDriveMergeDebugOn()) return;
  if (data && Object.keys(data).length > 0) {
    console.debug(PREFIX, event, data);
  } else {
    console.debug(PREFIX, event);
  }
}
