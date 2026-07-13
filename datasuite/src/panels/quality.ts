import { formatNum } from "../api";
import {
  el,
  empty,
  formatDayLabel,
  panelHeadline,
  renderBarChart,
  renderTable,
  sectionTitle,
} from "../dom";
import { bindCrashInboxRows } from "./crashDetail";
import { renderTriageSection } from "./triageActions";

function aggregateCrashDaily(
  rows: Array<{ day: string; crashes: number }>
): Array<{ label: string; value: number }> {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const day = String(row.day ?? "").slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + Number(row.crashes ?? 0));
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({ label: formatDayLabel(day), value }));
}

export function renderQuality(container: HTMLElement, data: Record<string, unknown>, days = 30 as 7 | 30 | 90): void {
  container.replaceChildren();
  if (data.headline) container.append(panelHeadline(String(data.headline)));

  const crashDaily = (data.crash_daily ?? []) as Array<{ day: string; crashes: number }>;
  const signatures = (data.top_signatures ?? []) as Array<Record<string, unknown>>;
  const releaseRates = (data.release_rates ?? []) as Array<Record<string, unknown>>;
  const inbox = (data.crash_inbox ?? []) as Array<Record<string, unknown>>;
  const triage = (data.crash_triage ?? []) as Array<Record<string, unknown>>;

  if (crashDaily.length === 0 && signatures.length === 0 && releaseRates.length === 0 && inbox.length === 0 && triage.length === 0) {
    container.append(empty("No crashes recorded in this period."));
    return;
  }

  const crashTrend = aggregateCrashDaily(crashDaily);
  if (crashTrend.length > 0) {
    container.append(renderBarChart(crashTrend, "Crash trend"));
  }

  if (releaseRates.length > 0) {
    container.append(sectionTitle("Release health"));
    container.append(
      renderTable(
        ["Version", "Crashes", "App starts", "Crashes per 100 starts"],
        releaseRates.map((r) => [
          String(r.app_version ?? ""),
          formatNum(r.crashes),
          formatNum(r.starts),
          r.crashes_per_100_starts != null ? `${r.crashes_per_100_starts}%` : "—",
        ])
      )
    );
  }

  if (signatures.length > 0) {
    container.append(sectionTitle("Top crash signatures"));
    container.append(
      renderTable(
        ["Signature", "Version", "Source", "Count"],
        signatures.map((s) => [
          String(s.signature ?? ""),
          String(s.app_version ?? ""),
          String(s.source ?? ""),
          formatNum(s.crashes),
        ])
      )
    );
  }

  if (inbox.length > 0) {
    container.append(sectionTitle("Recent crashes — click a row for detail"));
    const table = renderTable(
      ["When", "Feature", "Intent", "Tool", "Version", "Preview"],
      inbox.map((row) => [
        String(row.created_at ?? "").slice(0, 16),
        String(row.active_feature ?? "—"),
        String(row.intent_bucket ?? "—"),
        String(row.tool_name ?? "—"),
        String(row.app_version ?? ""),
        String(row.signature_preview ?? ""),
      ]),
    );
    table.querySelectorAll("tbody tr").forEach((tr, i) => {
      const row = inbox[i];
      if (!row?.id) return;
      tr.classList.add("crash-inbox-row");
      tr.setAttribute("data-crash-id", String(row.id));
      tr.setAttribute("title", "View crash detail");
    });
    container.append(table);
    bindCrashInboxRows(container, inbox, days);
  }

  if (triage.length > 0) {
    renderTriageSection(container, triage);
  }
}
