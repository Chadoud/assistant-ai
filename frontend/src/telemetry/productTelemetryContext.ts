let telemetryOptIn = false;
let uiLocale = "en";

export function setProductTelemetryContext(optIn: boolean, locale: string): void {
  telemetryOptIn = optIn;
  uiLocale = locale || "en";
}

export function getProductTelemetryOptIn(): boolean {
  return telemetryOptIn;
}

export function getProductTelemetryLocale(): string {
  return uiLocale;
}

/** Bucket wall-clock duration for privacy-safe telemetry props. */
export function durationBucket(seconds: number): string {
  if (seconds < 5) return "0-5s";
  if (seconds < 30) return "5-30s";
  if (seconds < 120) return "30s-2m";
  if (seconds < 600) return "2-10m";
  return "10m+";
}
