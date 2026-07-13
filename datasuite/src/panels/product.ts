import { formatNum } from "../api";
import {
  el,
  empty,
  panelHeadline,
  renderBarChart,
  renderTable,
  sectionTitle,
} from "../dom";

type Priority = {
  severity: string;
  area: string;
  title: string;
  evidence: string;
  action: string;
  panel: string;
};

function severityClass(severity: string): string {
  if (severity === "critical") return "priority-critical";
  if (severity === "high") return "priority-high";
  return "priority-medium";
}

function renderPriorityCard(item: Priority, onNavigate: (panel: string) => void): HTMLElement {
  const card = el("article", `priority-card ${severityClass(item.severity)}`);
  card.append(
    el("div", "priority-meta", `${item.area} · ${item.severity.toUpperCase()}`),
    el("h3", "priority-title", item.title),
    el("p", "priority-evidence", item.evidence),
    el("p", "priority-action", item.action),
  );
  const btn = el("button", "priority-link", "Open related view →");
  btn.type = "button";
  btn.addEventListener("click", () => onNavigate(item.panel));
  card.append(btn);
  return card;
}

export function renderProduct(
  container: HTMLElement,
  data: Record<string, unknown>,
  onNavigate: (panel: string) => void,
): void {
  container.replaceChildren();
  if (data.headline) container.append(panelHeadline(String(data.headline)));

  const priorities = (data.priorities ?? []) as Priority[];
  if (priorities.length > 0) {
    container.append(sectionTitle("What to fix first"));
    const row = el("div", "priority-grid");
    for (const item of priorities) {
      row.append(renderPriorityCard(item, onNavigate));
    }
    container.append(row);
  }

  const sortHealth = (data.sort_health ?? {}) as Record<string, number | null>;
  const jobsCompleted = Number(sortHealth.jobs_completed ?? 0);
  if (jobsCompleted > 0) {
    container.append(sectionTitle("Sort quality"));
    const cards = el("div", "cards");
    const stats: Array<[string, string]> = [
      ["Sorts finished", formatNum(jobsCompleted)],
      ["Clean sorts", formatNum(sortHealth.clean_jobs ?? 0)],
      ["Flagged uncertain", formatNum(sortHealth.uncertain_jobs ?? 0)],
      ["Had failures", formatNum(sortHealth.failure_jobs ?? 0)],
    ];
    if (sortHealth.clean_rate_pct != null) {
      stats.push(["Clean rate", `${sortHealth.clean_rate_pct}%`]);
    }
    if (sortHealth.messy_rate_pct != null) {
      stats.push(["Messy sorts", `${sortHealth.messy_rate_pct}%`]);
    }
    for (const [label, value] of stats) {
      const card = el("div", "card");
      card.append(el("div", "muted", label), el("p", "value", value));
      cards.append(card);
    }
    container.append(cards);
    container.append(
      el(
        "p",
        "metric-description",
        "Messy = sorts with uncertain files or fetch/sort failures. Requires latest desktop build.",
      ),
    );
  }

  const blockers = (data.sort_blockers ?? []) as Array<{
    label: string;
    blocks: number;
    unique_installs: number;
  }>;
  if (blockers.length > 0) {
    container.append(sectionTitle("Why sorts never started"));
    container.append(
      renderBarChart(
        blockers.slice(0, 8).map((b) => ({ label: b.label, value: b.blocks })),
        "Blocked attempts by reason",
      ),
    );
    container.append(
      renderTable(
        ["Reason", "Blocks", "Installs"],
        blockers.map((b) => [b.label, formatNum(b.blocks), formatNum(b.unique_installs)]),
      ),
    );
  }

  const reviewFunnel = (data.review_funnel ?? {}) as Record<string, number | null>;
  const reviewOpened = Number(reviewFunnel.review_opened ?? 0);
  if (reviewOpened > 0) {
    container.append(sectionTitle("Review cleanup loop"));
    const cards = el("div", "cards");
    const stats: Array<[string, string]> = [
      ["Review opened", formatNum(reviewOpened)],
      ["Bulk applied", formatNum(reviewFunnel.bulk_applied ?? 0)],
      ["Manual reassign", formatNum(reviewFunnel.reassigns ?? 0)],
      ["Left without applying", formatNum(reviewFunnel.dismissed ?? 0)],
    ];
    if (reviewFunnel.apply_rate_pct != null) {
      stats.push(["Apply rate", `${reviewFunnel.apply_rate_pct}%`]);
    }
    for (const [label, value] of stats) {
      const card = el("div", "card");
      card.append(el("div", "muted", label), el("p", "value", value));
      cards.append(card);
    }
    container.append(cards);
    container.append(
      el(
        "p",
        "metric-description",
        "Measures how often users fix uncertain files after a sort. Requires latest desktop build.",
      ),
    );
  }

  const setupMilestones = (data.setup_milestones ?? []) as Array<{
    label: string;
    first_hits: number;
    unique_installs: number;
  }>;
  if (setupMilestones.length > 0) {
    container.append(sectionTitle("Setup milestones"));
    container.append(
      renderTable(
        ["Milestone", "Events", "Installs"],
        setupMilestones.map((m) => [
          m.label,
          formatNum(m.first_hits),
          formatNum(m.unique_installs),
        ]),
      ),
    );
  }

  const assistantIntent = (data.assistant_intent ?? []) as Array<{
    label: string;
    turns: number;
    unique_installs: number;
  }>;
  if (assistantIntent.length > 0) {
    container.append(sectionTitle("What users ask the assistant"));
    container.append(
      renderBarChart(
        assistantIntent.slice(0, 8).map((row) => ({ label: row.label, value: row.turns })),
        "Assistant turns by intent",
      ),
    );
    container.append(
      renderTable(
        ["Intent", "Turns", "Installs"],
        assistantIntent.map((row) => [
          row.label,
          formatNum(row.turns),
          formatNum(row.unique_installs),
        ]),
      ),
    );
  }

  const featureRank = (data.feature_rank ?? []) as Array<{
    label: string;
    score: number;
    entries: number;
    exits: number;
  }>;
  if (featureRank.length > 0) {
    container.append(sectionTitle("Where users spend time"));
    container.append(
      renderBarChart(
        featureRank.slice(0, 8).map((f) => ({ label: f.label, value: Math.round(f.score) })),
        "Engagement index by feature (higher = more time)",
      ),
    );
    container.append(
      renderTable(
        ["Feature", "Engagement", "Visits", "Sessions ended"],
        featureRank.map((f) => [
          f.label,
          formatNum(Math.round(f.score)),
          formatNum(f.entries),
          formatNum(f.exits),
        ]),
      ),
    );
  } else {
    container.append(
      empty("No feature time data yet — ship the latest desktop build with analytics enabled."),
    );
  }

  const assistantOps = (data.assistant_ops ?? {}) as Record<string, number>;
  const successRate = data.assistant_success_rate as number | null | undefined;
  if (Number(assistantOps.turns_started ?? 0) > 0) {
    container.append(sectionTitle("Assistant health"));
    const cards = el("div", "cards");
    const stats: Array<[string, string]> = [
      ["Turns started", formatNum(assistantOps.turns_started)],
      ["Turns completed", formatNum(assistantOps.turns_completed)],
      ["Turns failed", formatNum(assistantOps.turns_failed)],
      ["Provider errors", formatNum(assistantOps.provider_errors)],
      ["Tools invoked", formatNum(assistantOps.tools_invoked)],
    ];
    if (successRate != null) {
      stats.push(["Success rate", `${successRate}%`]);
    }
    for (const [label, value] of stats) {
      const card = el("div", "card");
      card.append(el("div", "muted", label), el("p", "value", value));
      cards.append(card);
    }
    container.append(cards);
  }

  const tools = (data.assistant_tools ?? []) as Array<{ tool_name: string; invocations: number }>;
  if (tools.length > 0) {
    container.append(sectionTitle("Top assistant actions"));
    container.append(
      renderTable(
        ["Tool", "Invocations"],
        tools.map((t) => [String(t.tool_name ?? ""), formatNum(t.invocations)]),
      ),
    );
  }

  const crashByFeature = (data.crash_by_feature ?? []) as Array<Record<string, unknown>>;
  if (crashByFeature.length > 0) {
    container.append(sectionTitle("Reliability by feature"));
    container.append(
      renderTable(
        ["Feature", "Crashes", "Sessions", "Last seen"],
        crashByFeature.map((r) => [
          String(r.feature ?? ""),
          formatNum(r.crashes),
          formatNum(r.affected_sessions),
          String(r.last_seen ?? "").slice(0, 16),
        ]),
      ),
    );
  }

  const messaging = (data.messaging_health ?? []) as Array<Record<string, unknown>>;
  if (messaging.length > 0) {
    container.append(sectionTitle("Messaging reliability"));
    container.append(
      renderTable(
        ["Platform", "Started", "Completed", "Failed"],
        messaging.map((r) => [
          String(r.platform ?? ""),
          formatNum(r.started),
          formatNum(r.completed),
          formatNum(r.failed),
        ]),
      ),
    );
  }

  const integrations = (data.integration_health ?? []) as Array<Record<string, unknown>>;
  if (integrations.length > 0) {
    container.append(sectionTitle("Integration connect health"));
    container.append(
      renderTable(
        ["Provider", "Success", "Failed"],
        integrations.map((r) => [
          String(r.provider ?? ""),
          formatNum(r.connects_ok),
          formatNum(r.connects_failed),
        ]),
      ),
    );
  }
}
