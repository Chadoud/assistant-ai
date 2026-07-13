const STORAGE_KEY = "exosites.telemetry.session_id";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Per app-open session id — shared by telemetry batches and crash reports. */
export function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 8) return existing;
    const id = randomId();
    sessionStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

/** Force a new session (e.g. after long idle — wired in a later iteration). */
export function rotateSessionId(): string {
  const id = randomId();
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* sessionStorage unavailable */
  }
  return id;
}
