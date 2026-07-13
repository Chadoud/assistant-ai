import { formatNum, type PeriodDays } from "../api";
import { bindAccountRows } from "./accountProfile";
import {
  chartColors,
  drawLineChart,
  el,
  empty,
  fillDailySeries,
  loading,
  panelHeadline,
  renderTable,
  sectionTitle,
  whenChartReady,
  type LineSeries,
} from "../dom";

interface Summary {
  active?: number;
  silent?: number;
  likely_churned?: number;
  new_installs?: number;
  total?: number;
  accounts_deleted_7d?: number;
}

interface DeviceRow {
  instance_id: string;
  first_seen: string;
  last_seen: string;
  active_days: number;
  event_count: number;
  last_app_version: string;
  last_platform: string;
  signed_in: boolean;
  status: string;
  status_label: string;
}

interface AccountRow {
  account_id: string;
  email_masked: string;
  display_name?: string | null;
  first_seen: string;
  last_seen: string;
  device_count: number;
  event_count: number;
  status_label: string;
}

interface CohortRow {
  cohort_week: string;
  weeks_since: number;
  retained: number;
  cohort_size: number;
  rate_pct: number | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function daysAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

function statusBadge(label: string, status: string): HTMLElement {
  const span = el("span", `status-badge status-${status}`, label);
  return span;
}

function summaryCard(label: string, value: number, hint: string): HTMLElement {
  const card = el("div", "card metric-card");
  card.append(el("div", "muted", label));
  card.append(el("p", "value", formatNum(value)));
  card.append(el("p", "metric-description", hint));
  return card;
}

async function loadDeviceDetail(instanceId: string, days: PeriodDays): Promise<Record<string, unknown>> {
  const url = `/api/activity-detail.php?instance_id=${encodeURIComponent(instanceId)}&days=${days}`;
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new Error(`Detail failed (${res.status})`);
  return res.json() as Promise<Record<string, unknown>>;
}

function renderDeviceDetail(
  container: HTMLElement,
  instanceId: string,
  days: PeriodDays,
  onBack: () => void
): void {
  container.replaceChildren(loading());
  void loadDeviceDetail(instanceId, days)
    .then((data) => {
      const detail = (data.detail ?? {}) as {
        daily?: Array<{ day: string; events: number }>;
        events?: Array<{ label: string; events: number }>;
        sessions?: Array<Record<string, unknown>>;
        crashes?: Array<Record<string, unknown>>;
        features?: Array<{ label: string; events: number }>;
      };
      container.replaceChildren();
      const back = el("button", "back-link", "← Back to installs");
      back.type = "button";
      back.addEventListener("click", onBack);
      container.append(back);
      container.append(sectionTitle(`Install ${instanceId.slice(0, 12)}…`));

      const daily = (detail.daily ?? []).map((p) => ({ day: p.day, value: p.events }));
      if (daily.length > 0) {
        const chartWrap = el("div", "card chart-card");
        chartWrap.append(el("h3", "chart-title", "Daily events"));
        const canvas = document.createElement("canvas");
        canvas.className = "line-chart";
        chartWrap.append(canvas);
        container.append(chartWrap);
        const filled = fillDailySeries(days, daily);
        const series: LineSeries[] = [
          {
            label: "Events",
            color: chartColors().primary,
            points: filled.map((p) => ({ x: p.day, y: p.value })),
          },
        ];
        whenChartReady(canvas, () => drawLineChart(canvas, series, 200));
      } else {
        container.append(empty("No events in this period for this install."));
      }

      const events = detail.events ?? [];
      if (events.length > 0) {
        container.append(sectionTitle("Event mix"));
        container.append(
          renderTable(
            ["Event", "Count"],
            events.map((e) => [e.label, formatNum(e.events)])
          )
        );
      }

      const features = detail.features ?? [];
      if (features.length > 0) {
        container.append(sectionTitle("Feature usage"));
        container.append(
          renderTable(
            ["Feature", "Events"],
            features.map((f) => [f.label, formatNum(f.events)]),
          ),
        );
      }

      const sessions = detail.sessions ?? [];
      if (sessions.length > 0) {
        container.append(sectionTitle("Recent sessions"));
        container.append(
          renderTable(
            ["Started", "Ended", "Version", "Crashed"],
            sessions.map((s) => [
              String(s.started_at ?? "").slice(0, 16),
              String(s.ended_at ?? "").slice(0, 16),
              String(s.app_version ?? ""),
              Number(s.crashed ?? 0) ? "Yes" : "—",
            ]),
          ),
        );
      }

      const crashes = detail.crashes ?? [];
      if (crashes.length > 0) {
        container.append(sectionTitle("Crashes on this install"));
        container.append(
          renderTable(
            ["When", "Feature", "Intent", "Preview"],
            crashes.map((c) => [
              String(c.created_at ?? "").slice(0, 16),
              String(c.active_feature ?? "—"),
              String(c.intent_bucket ?? "—"),
              String(c.preview ?? ""),
            ]),
          ),
        );
      }
    })
    .catch((e) => {
      container.replaceChildren(el("p", "error", e instanceof Error ? e.message : "Failed to load detail"));
    });
}

export function renderActivity(
  container: HTMLElement,
  data: Record<string, unknown>,
  retention: Record<string, unknown> | null,
  days: PeriodDays,
  onStatusFilter: (status: string | null) => void,
  activeStatus: string | null
): void {
  let selectedInstance: string | null = null;

  const renderMain = (): void => {
    if (selectedInstance) {
      renderDeviceDetail(container, selectedInstance, days, () => {
        selectedInstance = null;
        renderMain();
      });
      return;
    }

    container.replaceChildren();
    if (data.headline) {
      container.append(panelHeadline(String(data.headline)));
    }

    const summary = (data.summary ?? {}) as Summary;
    const accountSummary = (data.account_summary ?? {}) as Summary;

    const cards = el("div", "cards");
    cards.append(
      summaryCard("Active installs", summary.active ?? 0, "Sent events in the last 7 days")
    );
    cards.append(
      summaryCard("Silent", summary.silent ?? 0, "Last active 8–30 days ago — may still be installed")
    );
    cards.append(
      summaryCard("Likely stopped", summary.likely_churned ?? 0, "No events for 30+ days")
    );
    cards.append(
      summaryCard(
        "Signed-in accounts active",
        accountSummary.active ?? 0,
        "Cloud accounts with recent opt-in usage"
      )
    );
    if ((summary.accounts_deleted_7d ?? 0) > 0) {
      cards.append(
        summaryCard(
          "Accounts deleted (7d)",
          summary.accounts_deleted_7d ?? 0,
          "Cloud accounts removed — telemetry for those accounts was erased"
        )
      );
    }
    container.append(cards);

    const filters = el("div", "filter-row");
    const filterOptions: Array<{ key: string | null; label: string }> = [
      { key: null, label: "All" },
      { key: "active", label: "Active" },
      { key: "silent", label: "Silent" },
      { key: "likely_churned", label: "Likely stopped" },
      { key: "new", label: "New" },
    ];
    for (const opt of filterOptions) {
      const btn = el(
        "button",
        `filter-btn${activeStatus === opt.key ? " active" : ""}`,
        opt.label
      );
      btn.type = "button";
      btn.addEventListener("click", () => onStatusFilter(opt.key));
      filters.append(btn);
    }
    container.append(filters);

    const devices = (data.devices ?? []) as DeviceRow[];
    container.append(sectionTitle("Installs"));
    if (devices.length === 0) {
      container.append(
        empty("No installs with opt-in analytics yet. Enable usage analytics in Settings on a beta build.")
      );
    } else {
      const table = document.createElement("table");
      table.className = "data-table activity-table";
      const thead = document.createElement("thead");
      thead.innerHTML =
        "<tr><th>Status</th><th>First seen</th><th>Last seen</th><th>Active days</th><th>Events</th><th>Version</th><th>Platform</th><th>Signed in</th></tr>";
      table.append(thead);
      const tbody = document.createElement("tbody");
      for (const row of devices) {
        const tr = document.createElement("tr");
        tr.className = "clickable-row";
        tr.title = "View daily activity";
        tr.addEventListener("click", () => {
          selectedInstance = row.instance_id;
          renderMain();
        });
        const statusTd = document.createElement("td");
        statusTd.append(statusBadge(row.status_label, row.status));
        tr.append(statusTd);
        const cells = [
          formatDate(row.first_seen),
          `${formatDate(row.last_seen)} (${daysAgo(row.last_seen)})`,
          formatNum(row.active_days),
          formatNum(row.event_count),
          row.last_app_version || "—",
          row.last_platform || "—",
          row.signed_in ? "Yes" : "No",
        ];
        for (const text of cells) {
          const td = document.createElement("td");
          td.textContent = text;
          tr.append(td);
        }
        tbody.append(tr);
      }
      table.append(tbody);
      container.append(table);
    }

    const accounts = (data.accounts ?? []) as AccountRow[];
    if (accounts.length > 0) {
      container.append(sectionTitle("Signed-in accounts — click a row for account 360"));
      const table = renderTable(
        ["Name", "Email", "First seen", "Last seen", "Devices", "Events", "Status"],
        accounts.map((a) => [
          a.display_name?.trim() || "—",
          a.email_masked,
          formatDate(a.first_seen),
          formatDate(a.last_seen),
          formatNum(a.device_count),
          formatNum(a.event_count),
          a.status_label,
        ]),
      );
      table.querySelectorAll("tbody tr").forEach((tr) => {
        tr.classList.add("account-row", "crash-inbox-row");
        tr.setAttribute("title", "View account profile");
      });
      container.append(table);
      bindAccountRows(container, accounts, days);
    }

    const cohorts = (retention?.cohorts ?? []) as CohortRow[];
    container.append(sectionTitle("Weekly retention"));
    container.append(
      el(
        "p",
        "metric-description",
        String(retention?.headline ?? "Cohort retention by week of first open.")
      )
    );
    if (cohorts.length === 0) {
      container.append(empty("Not enough install history for cohorts yet."));
    } else {
      const byCohort = new Map<string, CohortRow[]>();
      for (const row of cohorts) {
        const list = byCohort.get(row.cohort_week) ?? [];
        list.push(row);
        byCohort.set(row.cohort_week, list);
      }
      for (const [week, rows] of byCohort) {
        const size = rows.find((r) => r.weeks_since === 0)?.cohort_size ?? 0;
        const block = el("div", "card cohort-card");
        block.append(el("h3", "chart-title", `Cohort starting ${week} (${size} installs)`));
        if (size < 5) {
          block.append(el("p", "muted", "Insufficient data — need at least 5 installs."));
        } else {
          const w4 = rows.find((r) => r.weeks_since === 4);
          const w8 = rows.find((r) => r.weeks_since === 8);
          const parts = [`Week 0: 100%`];
          if (w4?.rate_pct != null) parts.push(`Week 4: ${w4.rate_pct}%`);
          if (w8?.rate_pct != null) parts.push(`Week 8: ${w8.rate_pct}%`);
          block.append(el("p", "metric-description", parts.join(" · ")));
        }
        container.append(block);
      }
    }
  };

  renderMain();
}
