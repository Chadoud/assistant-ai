import type { AppSettings } from "../types/settings";

/** Default diagnostics when accepting Terms — on by default (legitimate interest); user may object in Settings. */
export function diagnosticsOnLegalAccept(): Pick<AppSettings, "telemetryOptIn" | "crashReportsOptIn"> {
  return { telemetryOptIn: true, crashReportsOptIn: true };
}
