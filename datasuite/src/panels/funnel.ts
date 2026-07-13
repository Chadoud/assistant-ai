import { formatNum } from "../api";
import {
  el,
  empty,
  panelHeadline,
  renderBarChart,
  renderWaterfall,
  sectionTitle,
} from "../dom";

export function renderFunnel(container: HTMLElement, data: Record<string, unknown>): void {
  container.replaceChildren();
  if (data.headline) container.append(panelHeadline(String(data.headline)));

  const waterfall = (data.waterfall ?? []) as Array<{
    label: string;
    events: number;
    pct_of_start: number | null;
  }>;
  const rates = (data.rates ?? {}) as Record<string, number | null>;
  const onboarding = (data.onboarding ?? []) as Array<{ event_name: string; events: number }>;
  const setupMilestones = (data.setup_milestones ?? []) as Array<{
    label: string;
    unique_installs: number;
    pct_of_start: number | null;
  }>;

  if (waterfall.length === 0 && onboarding.length === 0 && setupMilestones.length === 0) {
    container.append(empty("No funnel events in this period."));
    return;
  }

  if (waterfall.length > 0) {
    container.append(sectionTitle("Sort funnel (waterfall)"));
    container.append(renderWaterfall(waterfall));
  }

  const rateLines: [string, number | null][] = [
    ["Welcome completed", rates.start_to_welcome ?? null],
    ["First drop", rates.start_to_drop ?? null],
    ["Sort started", rates.drop_to_job ?? null],
    ["Sort finished", rates.job_to_complete ?? null],
    ["Sort cancelled", rates.job_to_cancel ?? null],
    ["Post-run action", rates.complete_to_cta ?? null],
  ].filter(([, v]) => v != null);

  if (rateLines.length > 0) {
    const conv = el("div", "cards");
    for (const [label, pct] of rateLines) {
      const card = el("div", "card");
      card.append(el("div", "muted", label), el("p", "value", `${pct}%`));
      conv.append(card);
    }
    container.append(sectionTitle("Conversion rates"));
    container.append(conv);
  }

  if (setupMilestones.length > 0) {
    container.append(sectionTitle("Setup depth (first-time milestones)"));
    container.append(
      renderWaterfall(
        setupMilestones.map((step) => ({
          label: step.label,
          events: step.unique_installs,
          pct_of_start: step.pct_of_start,
        })),
      ),
    );
    container.append(
      el(
        "p",
        "metric-description",
        "Each step fires once per install. Drop-offs show where onboarding still loses people before their first sort.",
      ),
    );
  }

  if (onboarding.length > 0) {
    const bars = onboarding
      .map((s) => ({
        label: humanEventName(String(s.event_name ?? "")),
        value: Number(s.events ?? 0),
      }))
      .sort((a, b) => b.value - a.value);
    container.append(renderBarChart(bars, "Onboarding steps"));
  }
}

const EVENT_LABELS: Record<string, string> = {
  app_started: "App opened",
  welcome_step_viewed: "Welcome step viewed",
  welcome_completed: "Welcome finished",
  welcome_dismissed: "Welcome skipped",
  first_drop: "First files dropped",
};

function humanEventName(name: string): string {
  return EVENT_LABELS[name] ?? name.replace(/_/g, " ");
}
