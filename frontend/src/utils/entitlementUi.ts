import type { EntitlementStatus } from "../api";
import { FREE_TRIAL_DAYS } from "../constants";

/** Progress 0–100 for the trial bar (elapsed fraction of the trial window). */
export function trialBarPercent(ent: EntitlementStatus | null): number {
  if (!ent?.trialStartedAt || !ent.trialEndsAt) return 0;
  const start = Date.parse(ent.trialStartedAt);
  const end = Date.parse(ent.trialEndsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const elapsed = Date.now() - start;
  const total = end - start;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

/** Variables for `t("settings.trialMeterLine", …)`. */
export function trialLineVars(ent: EntitlementStatus) {
  return {
    days: ent.trialDaysRemaining,
    date: formatTrialEndDate(ent.trialEndsAt),
  };
}

/** Localized short date for trial end (uses browser locale). */
function formatTrialEndDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function trialDurationDays(): number {
  return FREE_TRIAL_DAYS;
}

/** Total trial window length from start/end timestamps (not days remaining). */
export function trialLengthDays(ent: EntitlementStatus | null | undefined): number {
  if (ent?.trialStartedAt && ent?.trialEndsAt) {
    const start = Date.parse(ent.trialStartedAt);
    const end = Date.parse(ent.trialEndsAt);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));
    }
  }
  return FREE_TRIAL_DAYS;
}

/** True when the trial window was opened recently (for one-time “trial started” messaging). */
export function isFreshTrial(ent: EntitlementStatus | null | undefined): boolean {
  if (!ent?.trialActive) return false;
  const total = trialLengthDays(ent);
  return ent.trialDaysRemaining >= total - 1;
}
