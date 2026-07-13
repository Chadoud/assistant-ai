import { formatNum, isMetricKey, type MetricKey, type PeriodDays } from "../api";
import {
  deltaBadge,
  el,
  empty,
  panelHeadline,
  renderBarChart,
  renderSparkline,
  sectionTitle,
} from "../dom";
import { renderMetricDetail } from "./metricDetail";

interface Metric {
  key?: string;
  label: string;
  description?: string;
  current: number;
  delta?: { direction: string; label: string } | null;
}

interface SparkPoint {
  day: string;
  value: number;
}

let activeMetricKey: MetricKey | null = null;

/** Leave metric drill-down when period or tab changes. */
export function resetOverviewDrillDown(): void {
  activeMetricKey = null;
}

export function renderOverview(container: HTMLElement, data: Record<string, unknown>): void {
  const days = (Number(data.period_days) === 7 || Number(data.period_days) === 90
    ? Number(data.period_days)
    : 30) as PeriodDays;

  if (activeMetricKey) {
    renderMetricDetail(container, days, activeMetricKey, () => {
      activeMetricKey = null;
      renderOverview(container, data);
    });
    return;
  }

  container.replaceChildren();
  if (data.headline) {
    container.append(panelHeadline(String(data.headline)));
  }

  const insights = (data.insights ?? []) as Array<{
    label: string;
    value: string;
    description: string;
  }>;
  if (insights.length > 0) {
    const row = el("div", "insight-cards");
    for (const item of insights) {
      const card = el("div", "card insight-card");
      card.append(el("div", "muted", item.label));
      card.append(el("p", "value insight-value", item.value));
      card.append(el("p", "metric-description", item.description));
      row.append(card);
    }
    container.append(row);
  }

  const metrics = (data.metrics ?? []) as Metric[];
  const sparklines = (data.sparklines ?? {}) as {
    devices?: SparkPoint[];
    events?: SparkPoint[];
  };

  if (metrics.length === 0) {
    container.append(empty("No opt-in events yet — normal during early beta."));
    return;
  }

  const cards = el("div", "cards");
  for (const metric of metrics) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card card-metric";
    const metricKey = (metric.key ?? labelToKey(metric.label)) as MetricKey | undefined;
    if (metricKey) {
      card.dataset.metricKey = metricKey;
      card.setAttribute("aria-label", `${metric.label} — view daily trend`);
    }
    card.append(el("div", "muted", metric.label));
    if (metric.description) {
      card.append(el("p", "metric-description", metric.description));
    }
    const valueRow = el("div", "value-row");
    valueRow.append(el("p", "value", formatNum(metric.current)));
    const badge = deltaBadge(metric.delta);
    if (badge) valueRow.append(badge);
    card.append(valueRow);

    if (metricKey === "active_devices" && sparklines.devices?.length) {
      card.append(renderSparkline(sparklines.devices));
    }
    if (metricKey === "total_events" && sparklines.events?.length) {
      card.append(renderSparkline(sparklines.events));
    }

    card.append(el("span", "card-hint muted", "View trend →"));
    card.addEventListener("click", () => {
      if (!metricKey || !isMetricKey(metricKey)) return;
      activeMetricKey = metricKey;
      renderMetricDetail(container, days, metricKey, () => {
        activeMetricKey = null;
        renderOverview(container, data);
      });
    });

    cards.append(card);
  }
  container.append(cards);

  const eventMix = (data.event_mix ?? []) as Array<{ label: string; events: number }>;
  if (eventMix.length > 0) {
    container.append(
      renderBarChart(
        eventMix.map((row) => ({ label: row.label, value: Number(row.events ?? 0) })),
        "What users did (event mix)"
      )
    );
  }

  container.append(
    sectionTitle(`Compared to the previous ${data.period_days ?? 30}-day period`)
  );
}

function labelToKey(label: string): MetricKey | null {
  const map: Record<string, MetricKey> = {
    "Active devices": "active_devices",
    "Signed-in users": "signed_in_users",
    Events: "total_events",
    "Product events": "total_events",
    "Sorts started": "jobs_started",
    "Sorts finished": "jobs_completed",
    Feedback: "feedback",
    Crashes: "crashes",
    "New accounts": "new_accounts",
  };
  return map[label] ?? null;
}
