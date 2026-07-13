/**
 * Thin wrapper over the Web Notification API (works in the Electron renderer).
 * Best-effort: requests permission lazily and silently no-ops when denied or
 * unavailable, so callers never need to guard.
 */

export async function osNotify(title: string, body: string): Promise<void> {
  try {
    if (typeof Notification === "undefined") return;
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return;
    new Notification(title, { body });
  } catch {
    /* best-effort — never throw from a notification */
  }
}
