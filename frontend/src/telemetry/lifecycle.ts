import { SETTINGS_STORAGE_KEY } from "../constants";
import { flushTelemetry, track } from "./client";
import { trackSetupMilestone } from "./setupTelemetry";
import { TelemetryEventNames, type TelemetryEventName } from "./schema";

type TelemetryContext = {
  optIn: boolean;
  locale: string;
};

/** Read persisted settings for auth flows that do not receive React settings props. */
export function readTelemetryContext(): TelemetryContext {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { optIn: false, locale: "en" };
    const parsed = JSON.parse(raw) as { telemetryOptIn?: boolean; uiLocale?: string };
    return {
      optIn: Boolean(parsed.telemetryOptIn),
      locale: typeof parsed.uiLocale === "string" ? parsed.uiLocale : "en",
    };
  } catch {
    return { optIn: false, locale: "en" };
  }
}

/** Enqueue one lifecycle event and flush immediately so short-lived flows still deliver. */
export function trackLifecycle(
  optIn: boolean,
  locale: string,
  name: TelemetryEventName,
  props: Record<string, string | number | boolean> = {}
): void {
  if (!optIn) return;
  track(optIn, locale, name, props);
  flushTelemetry(optIn, locale);
}

export function trackAccountSignedIn(optIn?: boolean, locale?: string): void {
  const ctx = optIn === undefined ? readTelemetryContext() : { optIn, locale: locale ?? "en" };
  trackLifecycle(ctx.optIn, ctx.locale, TelemetryEventNames.accountSignedIn, {
    ui_locale: ctx.locale,
  });
  trackSetupMilestone(ctx.optIn, ctx.locale, "account_linked");
}

export function trackAccountSignedOut(optIn?: boolean, locale?: string): void {
  const ctx = optIn === undefined ? readTelemetryContext() : { optIn, locale: locale ?? "en" };
  trackLifecycle(ctx.optIn, ctx.locale, TelemetryEventNames.accountSignedOut, {});
}

export function trackAccountDeleted(optIn?: boolean, locale?: string): void {
  const ctx = optIn === undefined ? readTelemetryContext() : { optIn, locale: locale ?? "en" };
  trackLifecycle(ctx.optIn, ctx.locale, TelemetryEventNames.accountDeleted, {});
}

export function trackDiagnosticsObjectionChanged(
  analyticsEnabled: boolean,
  locale: string,
): void {
  // Record objection/opt-back-in while the prior setting still allows one outbound event.
  track(true, locale, analyticsEnabled ? TelemetryEventNames.telemetryOptIn : TelemetryEventNames.telemetryOptOut, {});
  flushTelemetry(true, locale);
  if (analyticsEnabled) {
    trackSetupMilestone(true, locale, "telemetry_on");
  }
}

/** @deprecated Use trackDiagnosticsObjectionChanged — kept for call-site grep during migration. */
export const trackTelemetryOptInChanged = trackDiagnosticsObjectionChanged;
