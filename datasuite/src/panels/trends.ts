import {
  chartColors,
  drawLineChart,
  drawStackedArea,
  el,
  empty,
  fillDailySeries,
  panelHeadline,
  sectionTitle,
  whenChartReady,
} from "../dom";

export function renderTrends(container: HTMLElement, data: Record<string, unknown>): void {
  container.replaceChildren();
  if (data.headline) container.append(panelHeadline(String(data.headline)));

  const periodDays = Number(data.period_days) === 7 || Number(data.period_days) === 90
    ? Number(data.period_days)
    : 30;

  const trends = (data.trends ?? []) as Array<{
    day: string;
    devices: number;
    signed_in_users: number;
  }>;
  const mix = (data.signed_in_vs_anonymous ?? []) as Array<{
    day: string;
    signed_in_events: number;
    anonymous_events: number;
  }>;

  if (trends.length === 0 && mix.length === 0) {
    container.append(empty("No device activity in this period."));
    return;
  }

  if (trends.length > 0) {
    const filled = fillDailySeries(
      periodDays,
      trends.map((p) => ({ day: String(p.day), value: Number(p.devices ?? 0) }))
    );
    const signedFilled = fillDailySeries(
      periodDays,
      trends.map((p) => ({ day: String(p.day), value: Number(p.signed_in_users ?? 0) }))
    );
    const wrap = el("div", "trend-chart");
    const canvas = document.createElement("canvas");
    wrap.append(canvas);
    container.append(
      sectionTitle("Daily active devices"),
      el("p", "metric-description", "Distinct installs per day. Signed-in line shows accounts linked to telemetry."),
      wrap
    );
    const colors = chartColors();
    const lineSeries = () => [
      {
        label: "Devices",
        color: colors.primary,
        points: filled.map((p) => ({ x: p.day, y: p.value })),
      },
      {
        label: "Signed-in users",
        color: colors.secondary,
        points: signedFilled.map((p) => ({ x: p.day, y: p.value })),
      },
    ];
    const abort = new AbortController();
    whenChartReady(canvas, () => drawLineChart(canvas, lineSeries(), 280), abort.signal);
  }

  if (mix.length > 0) {
    const wrap = el("div", "trend-chart");
    const canvas = document.createElement("canvas");
    wrap.append(canvas);
    container.append(
      sectionTitle("Signed-in vs anonymous events"),
      el("p", "metric-description", "Whether telemetry rows were linked to a cloud account or anonymous install only."),
      wrap
    );
    const days = mix.map((m) => String(m.day));
    const signedIn = mix.map((m) => Number(m.signed_in_events ?? 0));
    const anonymous = mix.map((m) => Number(m.anonymous_events ?? 0));
    drawStackedArea(canvas, days, signedIn, anonymous);
  }
}
