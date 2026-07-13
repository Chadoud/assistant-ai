import { fetchCrashDetail, type PeriodDays } from "../api";
import { el, sectionTitle } from "../dom";

function parseBreadcrumbs(raw: unknown): unknown[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderCrashDetailModal(
  host: HTMLElement,
  crash: Record<string, unknown>,
  timeline: Array<Record<string, unknown>>,
): void {
  host.replaceChildren();
  const overlay = el("div", "crash-detail-overlay");
  const card = el("div", "crash-detail-card");
  const close = el("button", "crash-detail-close", "Close");
  close.type = "button";
  close.addEventListener("click", () => host.replaceChildren());

  card.append(
    el("h3", "crash-detail-title", `Crash #${String(crash.id ?? "?")}`),
    el("p", "crash-detail-meta", `${String(crash.created_at ?? "")} · ${String(crash.app_version ?? "")} · ${String(crash.source ?? "")}`),
  );

  const context = el("dl", "crash-detail-context");
  const fields: Array<[string, unknown]> = [
    ["Feature", crash.active_feature],
    ["Tab", crash.active_tab],
    ["Intent", crash.intent_bucket],
    ["Tool", crash.tool_name],
    ["Session", crash.session_id],
    ["Account", crash.account_email ?? crash.account_id],
  ];
  for (const [label, value] of fields) {
    if (value == null || value === "") continue;
    context.append(el("dt", "", label), el("dd", "", String(value)));
  }
  if (context.childElementCount > 0) card.append(context);

  card.append(sectionTitle("Error"));
  card.append(el("pre", "crash-detail-pre", String(crash.error_message ?? "")));

  if (crash.stack_trace) {
    card.append(sectionTitle("Stack"));
    card.append(el("pre", "crash-detail-pre crash-detail-stack", String(crash.stack_trace)));
  }

  const crumbs = parseBreadcrumbs(crash.last_events_json);
  if (crumbs.length > 0) {
    card.append(sectionTitle("Breadcrumbs"));
    card.append(el("pre", "crash-detail-pre", JSON.stringify(crumbs, null, 2)));
  } else {
    card.append(el("p", "muted", "No breadcrumbs (legacy crash or opt-out)."));
  }

  if (timeline.length > 0) {
    card.append(sectionTitle("Session timeline"));
    const list = el("ul", "crash-detail-timeline");
    for (const ev of timeline) {
      list.append(
        el(
          "li",
          "",
          `${String(ev.created_at ?? "")} — ${String(ev.event_name ?? "")}`,
        ),
      );
    }
    card.append(list);
  }

  card.append(close);
  overlay.append(card);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) host.replaceChildren();
  });
  host.append(overlay);
}

export function bindCrashInboxRows(
  container: HTMLElement,
  rows: Array<Record<string, unknown>>,
  days: PeriodDays,
): void {
  const modalHost = el("div", "crash-detail-host");
  container.append(modalHost);

  container.querySelectorAll("[data-crash-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const id = Number((node as HTMLElement).dataset.crashId ?? 0);
      if (!Number.isFinite(id) || id <= 0) return;
      void (async () => {
        modalHost.replaceChildren(el("p", "", "Loading crash detail…"));
        try {
          const data = await fetchCrashDetail(id, days);
          if (data.error || !data.crash) {
            modalHost.replaceChildren(el("p", "error", data.error ?? "Could not load crash"));
            return;
          }
          renderCrashDetailModal(modalHost, data.crash, data.timeline ?? []);
        } catch (e) {
          modalHost.replaceChildren(
            el("p", "error", e instanceof Error ? e.message : "Failed to load crash"),
          );
        }
      })();
    });
  });

  if (rows.length === 0) return;
}
