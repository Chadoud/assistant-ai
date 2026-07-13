import {
  categoryBadge,
  el,
  empty,
  panelHeadline,
  renderBarChart,
  sectionTitle,
} from "../dom";

const LAST_SEEN_KEY = "datasuite_last_feedback_id";

function aggregateFeedbackWeekly(
  rows: Array<{ category: string; submissions: number }>
): Array<{ label: string; value: number }> {
  const byCategory = new Map<string, number>();
  for (const row of rows) {
    const cat = String(row.category ?? "other");
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + Number(row.submissions ?? 0));
  }
  return [...byCategory.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([label, value]) => ({ label, value }));
}

export function renderFeedback(container: HTMLElement, data: Record<string, unknown>): void {
  container.replaceChildren();
  if (data.headline) container.append(panelHeadline(String(data.headline)));

  const inbox = (data.inbox ?? []) as Array<Record<string, unknown>>;
  const weekly = (data.weekly ?? []) as Array<{ category: string; submissions: number }>;
  const weeklyTotals = (data.weekly_totals ?? []) as Array<{ week_start: string; submissions: number }>;

  if (inbox.length === 0 && weekly.length === 0) {
    container.append(empty("No feedback submissions yet."));
    return;
  }

  const lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY) || 0);
  const newestId = inbox.reduce((max, row) => Math.max(max, Number(row.id ?? 0)), 0);
  const newCount = inbox.filter((row) => Number(row.id ?? 0) > lastSeen).length;
  if (newCount > 0) {
    container.append(el("p", "new-badge", `${newCount} new since your last visit`));
  }
  if (newestId > 0) {
    localStorage.setItem(LAST_SEEN_KEY, String(newestId));
  }

  if (weeklyTotals.length > 0) {
    const lineData = weeklyTotals.map((w) => ({
      label: String(w.week_start).slice(5, 10),
      value: Number(w.submissions ?? 0),
    }));
    container.append(renderBarChart(lineData, "Submissions by week (12w)"));
  }

  const weeklyBars = aggregateFeedbackWeekly(weekly);
  if (weeklyBars.length > 0) {
    container.append(renderBarChart(weeklyBars, "Feedback by category"));
  }

  if (inbox.length > 0) {
    container.append(sectionTitle("Recent feedback"));
    const list = el("div", "feedback-list");
    for (const item of inbox) {
      const row = el("article", "feedback-item");
      const head = el("div", "feedback-head");
      head.append(
        categoryBadge(String(item.category ?? "other")),
        el("span", "muted", String(item.created_at ?? "").slice(0, 16)),
        el("span", "muted", String(item.locale ?? "")),
        el("span", "muted", item.app_version ? `v${item.app_version}` : "")
      );
      row.append(head);
      row.append(el("p", "feedback-preview", String(item.message_preview ?? "")));
      const full = String(item.message ?? "");
      if (full.length > 0) {
        const toggle = el("button", "feedback-expand", "Show full message");
        const body = el("p", "feedback-full");
        body.hidden = true;
        body.textContent = full;
        toggle.addEventListener("click", () => {
          const open = body.hidden;
          body.hidden = !open;
          toggle.textContent = open ? "Hide message" : "Show full message";
        });
        row.append(toggle, body);
      }
      list.append(row);
    }
    container.append(list);
  }
}
