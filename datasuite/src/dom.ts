import { formatNum } from "./api";

/** Read theme token from :root (matches exosites.ch indigo palette). */
export function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function chartColors(): {
  primary: string;
  secondary: string;
  success: string;
  muted: string;
  border: string;
  grid: string;
} {
  return {
    primary: cssVar("--brand-primary", "#6366f1"),
    secondary: cssVar("--brand-secondary", "#818cf8"),
    success: cssVar("--success", "#4caf7d"),
    muted: cssVar("--text-muted", "#a5b4fc"),
    border: cssVar("--border-soft", "#3730a3"),
    grid: cssVar("--border", "#3730a3"),
  };
}

/** Apply alpha to a #rrggbb theme color for canvas fills. */
export function colorMix(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function loading(): HTMLElement {
  const wrap = el("div", "loading");
  wrap.append(el("div", "spinner"), el("span", "", "Loading…"));
  return wrap;
}

export function empty(message: string): HTMLElement {
  return el("p", "empty", message);
}

export function panelHeadline(text: string): HTMLElement {
  return el("p", "panel-headline", text);
}

export function sectionTitle(text: string): HTMLElement {
  return el("h2", "section-title", text);
}

export function renderTable(headers: string[], rows: string[][]): HTMLTableElement {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const h of headers) {
    const th = document.createElement("th");
    th.textContent = h;
    headRow.append(th);
  }
  thead.append(headRow);
  table.append(thead);
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}

export function deltaBadge(delta: { direction: string; label: string } | null | undefined): HTMLElement | null {
  if (!delta) return null;
  const span = el("span", `delta delta-${delta.direction}`, delta.label);
  return span;
}

export function categoryBadge(category: string): HTMLElement {
  const normalized = category.toLowerCase();
  return el("span", `badge badge-${normalized}`, category);
}

export function chartCard(title: string, content: HTMLElement): HTMLElement {
  const wrap = el("div", "chart-card");
  wrap.append(sectionTitle(title), content);
  return wrap;
}

export function formatDayLabel(day: string): string {
  return normalizeDayKey(day).slice(5, 10);
}

/** Normalize API/DB day values to YYYY-MM-DD. */
export function normalizeDayKey(day: string): string {
  return String(day).slice(0, 10);
}

/**
 * Expand sparse daily rows into a continuous timeline (missing days → 0).
 */
export function fillDailySeries(
  periodDays: number,
  sparse: Array<{ day: string; value: number }>
): Array<{ day: string; value: number }> {
  const byDay = new Map(
    sparse.map((point) => [normalizeDayKey(point.day), Number(point.value ?? 0)])
  );
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  const filled: Array<{ day: string; value: number }> = [];
  for (let offset = periodDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(end);
    date.setDate(end.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    filled.push({ day: key, value: byDay.get(key) ?? 0 });
  }
  return filled;
}

/** Draw once the canvas has layout dimensions. */
export function whenChartReady(
  canvas: HTMLCanvasElement,
  draw: () => void,
  signal?: AbortSignal
): void {
  const run = (): void => {
    if (canvas.clientWidth > 0) draw();
  };
  requestAnimationFrame(run);
  const observer = new ResizeObserver(run);
  observer.observe(canvas);
  signal?.addEventListener("abort", () => observer.disconnect(), { once: true });
}

export function aggregateByDay(
  rows: Array<{ day: string; value: number }>
): Array<{ label: string; value: number }> {
  return rows.map((r) => ({
    label: formatDayLabel(r.day),
    value: Number(r.value ?? 0),
  }));
}

export function maxValue(values: number[]): number {
  return Math.max(...values, 1);
}

export function renderSparkline(points: Array<{ day: string; value: number }>): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "sparkline";
  const draw = (): void => {
    const ctx = canvas.getContext("2d");
    if (!ctx || points.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 120;
    const height = 36;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    const maxY = maxValue(points.map((p) => p.value));
    const colors = chartColors();
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * (width - 4) + 2;
      const y = height - 4 - (p.value / maxY) * (height - 8);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };
  requestAnimationFrame(draw);
  return canvas;
}

export interface LineSeries {
  label: string;
  color: string;
  points: Array<{ x: string; y: number }>;
}

export function drawLineChart(canvas: HTMLCanvasElement, series: LineSeries[], height = 240): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || series.length === 0) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 640;
  canvas.width = Math.max(width, 1) * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = { t: 16, r: 16, b: 32, l: 44 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  const maxY = maxValue(allY);
  const pointCount = Math.max(...series.map((s) => s.points.length), 1);

  const colors = chartColors();
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, pad.t + plotH);
  ctx.lineTo(pad.l + plotW, pad.t + plotH);
  ctx.stroke();

  for (const s of series) {
    const coords = s.points.map((p, i) => ({
      x: pad.l + (i / Math.max(pointCount - 1, 1)) * plotW,
      y: pad.t + plotH - (p.y / maxY) * plotH,
    }));

    if (coords.length > 0) {
      ctx.fillStyle = colorMix(s.color, 0.12);
      ctx.beginPath();
      coords.forEach((c, i) => {
        if (i === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      const baseline = pad.t + plotH;
      ctx.lineTo(coords[coords.length - 1].x, baseline);
      ctx.lineTo(coords[0].x, baseline);
      ctx.closePath();
      ctx.fill();
    }

    if (coords.length > 1) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      coords.forEach((c, i) => {
        if (i === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      ctx.stroke();
    }

    ctx.fillStyle = s.color;
    for (const c of coords) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, coords.length === 1 ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = colors.muted;
  ctx.font = "11px Inter, system-ui";
  ctx.fillText(formatNum(maxY), 6, pad.t + 10);
  const first = series[0]?.points[0];
  const last = series[0]?.points[series[0].points.length - 1];
  if (first) ctx.fillText(formatDayLabel(first.x), pad.l, height - 8);
  if (last && last !== first) {
    ctx.fillText(formatDayLabel(last.x), pad.l + plotW - 40, height - 8);
  }

  const legend = el("div", "chart-legend");
  for (const s of series) {
    const item = el("span", "legend-item");
    const swatch = el("span", "legend-swatch");
    swatch.style.background = s.color;
    item.append(swatch, document.createTextNode(s.label));
    legend.append(item);
  }
  canvas.parentElement?.querySelector(".chart-legend")?.remove();
  canvas.parentElement?.append(legend);
}

export function drawStackedArea(
  canvas: HTMLCanvasElement,
  days: string[],
  signedIn: number[],
  anonymous: number[],
  height = 240
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || days.length === 0) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  const pad = { t: 16, r: 16, b: 32, l: 44 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const totals = days.map((_, i) => signedIn[i] + anonymous[i]);
  const maxY = maxValue(totals);

  const colors = chartColors();
  ctx.clearRect(0, 0, width, height);
  const n = days.length;
  for (let i = 0; i < n; i++) {
    const x = pad.l + (i / Math.max(n - 1, 1)) * plotW;
    const w = Math.max(plotW / n, 4);
    const anonH = (anonymous[i] / maxY) * plotH;
    const signedH = (signedIn[i] / maxY) * plotH;
    ctx.fillStyle = colorMix(colors.secondary, 0.55);
    ctx.fillRect(x - w / 2, pad.t + plotH - anonH, w, anonH);
    ctx.fillStyle = colors.success;
    ctx.fillRect(x - w / 2, pad.t + plotH - anonH - signedH, w, signedH);
  }

  const legend = el("div", "chart-legend");
  for (const [color, label] of [
    [colors.success, "Signed-in events"],
    [colorMix(colors.secondary, 0.55), "Anonymous events"],
  ] as const) {
    const item = el("span", "legend-item");
    const swatch = el("span", "legend-swatch");
    swatch.style.background = color;
    item.append(swatch, document.createTextNode(label));
    legend.append(item);
  }
  canvas.parentElement?.querySelector(".chart-legend")?.remove();
  canvas.parentElement?.append(legend);
}

export function renderWaterfall(
  steps: Array<{ label: string; events: number; pct_of_start: number | null }>
): HTMLElement {
  if (steps.length === 0) return empty("No funnel events in this period.");
  const max = maxValue(steps.map((s) => s.events));
  const chart = el("div", "waterfall");
  for (const step of steps) {
    const row = el("div", "waterfall-row");
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill waterfall-fill");
    fill.style.width = `${(step.events / max) * 100}%`;
    track.append(fill);
    const meta = el("div", "waterfall-meta");
    meta.append(
      el("strong", "", step.label),
      el("span", "muted", `${formatNum(step.events)} · ${step.pct_of_start ?? 0}% of starts`)
    );
    row.append(meta, track);
    chart.append(row);
  }
  return chart;
}

export function renderBarChart(
  rows: Array<{ label: string; value: number }>,
  title: string
): HTMLElement {
  if (rows.length === 0) return empty("No data for this period.");
  const max = maxValue(rows.map((r) => r.value));
  const chart = el("div", "bar-chart");
  for (const row of rows) {
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");
    fill.style.width = `${(row.value / max) * 100}%`;
    track.append(fill);
    const barRow = el("div", "bar-row");
    barRow.append(el("span", "", row.label), track, el("span", "", formatNum(row.value)));
    chart.append(barRow);
  }
  return chartCard(title, chart);
}
