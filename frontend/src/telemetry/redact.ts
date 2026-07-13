/**
 * Pure guards — ensure client-side props never contain forbidden keys before `track()`.
 * Server still validates; this catches mistakes early in development.
 */

/** Returns false if any key looks like a sensitive surface (heuristic). */
export function assertSafeTrackProps(props: Record<string, string | number | boolean>): boolean {
  for (const key of Object.keys(props)) {
    const k = key.toLowerCase();
    if (
      k.includes("path") ||
      k.includes("file") ||
      k.includes("folder") ||
      k.includes("email") ||
      k.includes("token") ||
      k.includes("password") ||
      k.includes("license") ||
      k.includes("content")
    ) {
      return false;
    }
  }
  return true;
}

export function assertSafeTrackPropsOrThrow(props: Record<string, string | number | boolean>): void {
  if (!assertSafeTrackProps(props)) {
    throw new Error(`[telemetry] unsafe props keys: ${Object.keys(props).join(", ")}`);
  }
}
