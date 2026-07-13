import { track } from "./client";
import { TelemetryEventNames } from "./schema";

const MILESTONES_KEY = "exosites.telemetry.setup_milestones.v1";

function milestoneSent(name: string): boolean {
  try {
    const raw = localStorage.getItem(MILESTONES_KEY);
    const set = raw ? (JSON.parse(raw) as string[]) : [];
    if (set.includes(name)) return true;
    set.push(name);
    localStorage.setItem(MILESTONES_KEY, JSON.stringify(set));
    return false;
  } catch {
    return false;
  }
}

/** Fire once per install per milestone. */
export function trackSetupMilestone(
  optIn: boolean,
  locale: string,
  milestone: string
): void {
  if (!optIn || milestoneSent(milestone)) return;
  track(optIn, locale, TelemetryEventNames.setupMilestone, { milestone });
}
