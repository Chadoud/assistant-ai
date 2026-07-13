import {
  fetchMetricDetail,
  formatNum,
  type MetricKey,
  type PeriodDays,
} from "../api";
import {
  chartColors,
  deltaBadge,
  drawLineChart,
  el,
  empty,
  fillDailySeries,
  loading,
  normalizeDayKey,
  renderTable,
  sectionTitle,
  whenChartReady,
  type LineSeries,
} from "../dom";

export interface MetricDetailPayload {
  key: MetricKey;
  label: string;
  description?: string;
  current: number;
  previous: number;
  delta?: { direction: string; label: string } | null;
  series: Array<{ day: string; value: number }>;
  breakdown?: Array<{ label: string; events: number }>;
  context?: {
    jobs_started: number;
    jobs_completed: number;
    jobs_failed: number;
    finish_rate_pct: number | null;
  };
  period_days: PeriodDays;
}

function formatDayRow(day: string): string {
  const key = normalizeDayKey(day);
  const date = new Date(`${key}T12:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function renderDailyBreakdown(
  label: string,
  points: Array<{ day: string; value: number }>
): HTMLElement {
  const active = points.filter((point) => point.value > 0);
  const wrap = el("div", "metric-detail-breakdown");

  if (active.length === 0) {
    wrap.append(
      sectionTitle("Daily breakdown"),
      empty("No activity recorded on any day in this period.")
    );
    return wrap;
  }

  const peak = active.reduce((best, point) =>
    point.value > best.value ? point : best
  );
  const stats = el("p", "metric-detail-stats muted");
  stats.textContent = `${active.length} day${active.length === 1 ? "" : "s"} with activity · peak ${formatNum(peak.value)} on ${formatDayRow(peak.day)}`;
  wrap.append(sectionTitle("Daily breakdown"), stats);

  const rows = [...active]
    .reverse()
    .map((point) => [formatDayRow(point.day), formatNum(point.value)]);
  wrap.append(renderTable(["Day", label], rows));
  return wrap;
}

export function renderMetricDetail(
  container: HTMLElement,
  days: PeriodDays,
  key: MetricKey,
  onBack: () => void
): void {
  container.replaceChildren(loading());
  const abort = new AbortController();

  void fetchMetricDetail(key, days)
    .then((data) =>
      paintMetricDetail(container, data, () => {
        abort.abort();
        onBack();
      }, abort.signal)
    )
    .catch((e) => {
      container.replaceChildren(
        el("p", "error", e instanceof Error ? e.message : "Failed to load chart")
      );
    });
}

function paintMetricDetail(
  container: HTMLElement,
  data: MetricDetailPayload,
  onBack: () => void,
  signal: AbortSignal
): void {
  container.replaceChildren();

  const wrap = el("div", "metric-detail");
  const header = el("header", "metric-detail-header");

  const back = el("button", "metric-detail-back", "← Overview");
  back.type = "button";
  back.addEventListener("click", onBack);
  header.append(back);

  const titleBlock = el("div", "metric-detail-title");
  titleBlock.append(el("h1", "metric-detail-name", data.label));
  titleBlock.append(
    el(
      "p",
      "muted metric-detail-period",
      `Daily trend · last ${data.period_days} days`
    )
  );
  header.append(titleBlock);

  if (data.description) {
    header.append(el("p", "metric-description metric-detail-desc", data.description));
  }

  const summary = el("div", "metric-detail-summary");
  const valueRow = el("div", "value-row");
  valueRow.append(el("p", "value metric-detail-value", formatNum(data.current)));
  const badge = deltaBadge(data.delta);
  if (badge) valueRow.append(badge);
  summary.append(valueRow);
  summary.append(
    el(
      "p",
      "muted metric-detail-compare",
      `Compared to the previous ${data.period_days}-day period (${formatNum(data.previous)})`
    )
  );
  header.append(summary);
  wrap.append(header);

  if (data.context?.finish_rate_pct != null) {
    const ctx = data.context;
    wrap.append(
      el(
        "p",
        "metric-detail-note muted",
        `Finish rate ${ctx.finish_rate_pct}% — ${formatNum(ctx.jobs_completed)} finished, ${formatNum(ctx.jobs_failed)} cancelled, of ${formatNum(ctx.jobs_started)} started.`
      )
    );
  }

  const filled = fillDailySeries(data.period_days, data.series);
  const points = filled.map((point) => ({
    x: point.day,
    y: Number(point.value ?? 0),
  }));

  const activeDays = points.filter((point) => point.y > 0).length;
  if (activeDays > 0 && activeDays <= 3) {
    wrap.append(
      el(
        "p",
        "metric-detail-note muted",
        `Sparse early-beta volume — activity on ${activeDays} day${activeDays === 1 ? "" : "s"} in this window. Zero days are shown on the timeline.`
      )
    );
  }

  const chartWrap = el("div", "trend-chart metric-detail-chart");
  const canvas = document.createElement("canvas");
  chartWrap.append(canvas);
  wrap.append(chartWrap);

  if (data.breakdown && data.breakdown.length > 0) {
    const breakdown = el("div", "metric-detail-breakdown");
    breakdown.append(sectionTitle("Event breakdown"));
    breakdown.append(
      renderTable(
        ["Event", "Count"],
        data.breakdown.map((row) => [row.label, formatNum(row.events)])
      )
    );
    wrap.append(breakdown);
  }

  wrap.append(renderDailyBreakdown(data.label, filled));
  container.append(wrap);

  const colors = chartColors();
  const series = (): LineSeries[] => [
    {
      label: data.label,
      color: colors.primary,
      points,
    },
  ];

  const draw = (): void => drawLineChart(canvas, series(), 320);
  whenChartReady(canvas, draw, signal);
}
