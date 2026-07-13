import "./app.css";
import {
  fetchActivity,
  fetchJson,
  fetchRetention,
  formatUpdatedAt,
  PANEL_PATHS,
  type PanelId,
  type PeriodDays,
} from "./api";
import { el, loading } from "./dom";
import { renderActivity } from "./panels/activity";
import { renderProduct } from "./panels/product";
import { renderOverview, resetOverviewDrillDown } from "./panels/overview";
import { renderFunnel } from "./panels/funnel";
import { renderQuality } from "./panels/quality";
import { renderFeedback } from "./panels/feedback";
import { renderTrends } from "./panels/trends";

const loaded = new Map<string, unknown>();
let activityStatusFilter: string | null = null;

function cacheKey(panel: PanelId, days: PeriodDays): string {
  if (panel === "activity") {
    return `${panel}:${days}:${activityStatusFilter ?? "all"}`;
  }
  return `${panel}:${days}`;
}

function getPeriodDays(): PeriodDays {
  const active = document.querySelector(".period-btn.active") as HTMLElement | null;
  const raw = Number(active?.dataset.days ?? 30);
  if (raw === 7 || raw === 90) return raw;
  return 30;
}

function setUpdatedAt(iso: string | undefined): void {
  const node = document.getElementById("updated-at");
  if (node) node.textContent = formatUpdatedAt(iso);
}

async function loadActivityPanel(days: PeriodDays): Promise<Record<string, unknown>> {
  const activity = await fetchActivity(days, activityStatusFilter);
  let retention: Record<string, unknown> = {
    cohorts: [],
    headline: "Weekly retention — share of installs still sending events each week after first open.",
  };
  try {
    retention = await fetchRetention(12);
  } catch {
    retention = {
      ...retention,
      cohorts: [],
      note: "Retention chart unavailable — install list below is still valid.",
    };
  }
  return { ...activity, _retention: retention };
}

async function loadPanel(id: PanelId, force = false): Promise<void> {
  const container = document.getElementById(`panel-${id}`);
  if (!container) return;
  const days = getPeriodDays();
  const key = cacheKey(id, days);
  if (!force && loaded.has(key)) {
    renderPanel(id, container, loaded.get(key) as Record<string, unknown>, days);
    return;
  }

  container.replaceChildren(loading());
  try {
    const data =
      id === "activity" ? await loadActivityPanel(days) : await fetchJson<Record<string, unknown>>(PANEL_PATHS[id], days);
    loaded.set(key, data);
    setUpdatedAt(String(data.updated_at ?? ""));
    renderPanel(id, container, data, days);
  } catch (e) {
    container.replaceChildren(
      el("p", "error", e instanceof Error ? e.message : "Failed to load")
    );
  }
}

function renderPanel(id: PanelId, container: HTMLElement, data: Record<string, unknown>, days: PeriodDays): void {
  switch (id) {
    case "product":
      renderProduct(container, data, (panel) => showPanel(panel as PanelId));
      break;
    case "overview":
      renderOverview(container, data);
      break;
    case "activity":
      renderActivity(
        container,
        data,
        (data._retention as Record<string, unknown> | null) ?? null,
        days,
        (status) => {
          activityStatusFilter = status;
          loaded.delete(cacheKey("activity", days));
          void loadPanel("activity", true);
        },
        activityStatusFilter
      );
      break;
    case "funnel":
      renderFunnel(container, data);
      break;
    case "quality":
      renderQuality(container, data, days);
      break;
    case "feedback":
      renderFeedback(container, data);
      break;
    case "trends":
      renderTrends(container, data);
      break;
  }
}

function showPanel(id: PanelId, force = false): void {
  if (id !== "overview") {
    resetOverviewDrillDown();
  }
  document.querySelectorAll(".panel").forEach((p) => {
    const panel = p as HTMLElement;
    const active = panel.id === `panel-${id}`;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", (t as HTMLElement).dataset.panel === id);
  });
  void loadPanel(id, force);
}

function refreshAll(force = true): void {
  loaded.clear();
  resetOverviewDrillDown();
  const active = document.querySelector(".panel.active") as HTMLElement | null;
  const id = (active?.id?.replace("panel-", "") ?? "overview") as PanelId;
  void loadPanel(id, force);
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = (btn as HTMLElement).dataset.panel as PanelId;
    if (id) showPanel(id);
  });
});

document.querySelectorAll(".period-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".period-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    loaded.clear();
    resetOverviewDrillDown();
    const active = document.querySelector(".panel.active") as HTMLElement | null;
    const id = (active?.id?.replace("panel-", "") ?? "overview") as PanelId;
    void loadPanel(id, true);
  });
});

document.getElementById("refresh-btn")?.addEventListener("click", () => refreshAll(true));

showPanel("product");
