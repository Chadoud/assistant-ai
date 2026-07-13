import { fetchAccountProfile, formatNum, type PeriodDays } from "../api";
import { el, renderTable, sectionTitle } from "../dom";

function formatDate(value: unknown): string {
  const s = String(value ?? "");
  if (!s) return "—";
  return s.slice(0, 10);
}

function renderAccountProfileModal(
  host: HTMLElement,
  profile: Record<string, unknown>,
): void {
  host.replaceChildren();
  const overlay = el("div", "crash-detail-overlay");
  const card = el("div", "crash-detail-card");
  const close = el("button", "crash-detail-close", "Close");
  close.type = "button";
  close.addEventListener("click", () => host.replaceChildren());

  card.append(
    el("h3", "crash-detail-title", String(profile.display_name ?? profile.email_masked ?? "Account")),
    el(
      "p",
      "crash-detail-meta",
      profile.display_name
        ? `${String(profile.email_masked ?? "")} · ${formatDate(profile.first_seen)} → ${formatDate(profile.last_seen)} · ${String(profile.status ?? "")}`
        : `${formatDate(profile.first_seen)} → ${formatDate(profile.last_seen)} · ${String(profile.status ?? "")}`,
    ),
  );

  const health = profile.health as Record<string, unknown> | null | undefined;
  if (health) {
    card.append(sectionTitle("Last 30 days"));
    card.append(
      renderTable(
        ["Devices", "Sessions", "Crashed sessions", "Last session"],
        [[
          formatNum(health.devices),
          formatNum(health.sessions),
          formatNum(health.crashed_sessions),
          String(health.last_session_at ?? "—").slice(0, 16),
        ]],
      ),
    );
  }

  card.append(sectionTitle("Usage"));
  card.append(
    renderTable(
      ["Devices", "Events", "Status"],
      [[
        formatNum(profile.device_count),
        formatNum(profile.event_count),
        String(profile.status ?? "—"),
      ]],
    ),
  );

  const crashes = (profile.crashes ?? []) as Array<Record<string, unknown>>;
  if (crashes.length > 0) {
    card.append(sectionTitle("Recent crashes"));
    card.append(
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
  } else {
    card.append(el("p", "muted", "No crashes for this account in the selected period."));
  }

  overlay.append(card, close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) host.replaceChildren();
  });
  host.append(overlay);
}

export function bindAccountRows(
  container: HTMLElement,
  accounts: Array<{ account_id?: string }>,
  days: PeriodDays,
): void {
  const rows = container.querySelectorAll("tbody tr.account-row");
  const modalHost = el("div", "crash-detail-host");
  container.append(modalHost);

  rows.forEach((tr, i) => {
    const accountId = accounts[i]?.account_id;
    if (!accountId) return;
    tr.addEventListener("click", async () => {
      modalHost.replaceChildren(el("p", "muted", "Loading account…"));
      try {
        const data = await fetchAccountProfile(accountId, days);
        if (data.error || !data.profile) {
          modalHost.replaceChildren(el("p", "muted", data.error ?? "Account not found"));
          return;
        }
        renderAccountProfileModal(modalHost, data.profile);
      } catch {
        modalHost.replaceChildren(el("p", "muted", "Could not load account profile."));
      }
    });
  });
}
