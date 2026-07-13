export type PanelId = "product" | "overview" | "activity" | "funnel" | "quality" | "feedback" | "trends";

export type PeriodDays = 7 | 30 | 90;

export type MetricKey =
  | "active_devices"
  | "signed_in_users"
  | "total_events"
  | "jobs_started"
  | "jobs_completed"
  | "feedback"
  | "crashes"
  | "new_accounts";

export const METRIC_KEYS: MetricKey[] = [
  "active_devices",
  "signed_in_users",
  "total_events",
  "jobs_started",
  "jobs_completed",
  "feedback",
  "crashes",
  "new_accounts",
];

export function isMetricKey(value: string): value is MetricKey {
  return (METRIC_KEYS as string[]).includes(value);
}

export const PANEL_PATHS: Record<PanelId, string> = {
  product: "/api/product.php",
  overview: "/api/overview.php",
  activity: "/api/activity.php",
  funnel: "/api/funnel.php",
  quality: "/api/quality.php",
  feedback: "/api/feedback.php",
  trends: "/api/trends.php",
};

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 120);
    throw new Error(
      snippet.startsWith("{")
        ? "Invalid JSON from server"
        : `Server returned HTML instead of JSON (${snippet || "empty body"})`,
    );
  }
}

export async function fetchJson<T>(path: string, days: PeriodDays): Promise<T> {
  const url = `${path}?days=${days}`;
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/login.php";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return parseJsonResponse<T>(res);
}

export async function fetchMetricDetail(key: MetricKey, days: PeriodDays) {
  const url = `/api/metric.php?key=${encodeURIComponent(key)}&days=${days}`;
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/login.php";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return res.json();
}

export async function fetchActivity(days: PeriodDays, status: string | null = null) {
  let url = `/api/activity.php?days=${days}`;
  if (status) url += `&status=${encodeURIComponent(status)}`;
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/login.php";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await parseJsonResponse<{ detail?: string; error?: string }>(res.clone())) as {
        detail?: string;
        error?: string;
      };
      detail = body.detail ?? body.error ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(detail ? `Request failed (${res.status}): ${detail}` : `Request failed (${res.status})`);
  }
  return parseJsonResponse(res);
}

export async function fetchRetention(weeks = 12) {
  const url = `/api/retention.php?weeks=${weeks}`;
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/login.php";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return parseJsonResponse(res);
}

export async function fetchCrashDetail(id: number, days: PeriodDays = 30) {
  const url = `/api/crash-detail.php?id=${encodeURIComponent(String(id))}&days=${days}`;
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/login.php";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<{
    error?: string;
    crash?: Record<string, unknown>;
    timeline?: Array<Record<string, unknown>>;
  }>;
}

export async function fetchAccountProfile(accountId: string, days: PeriodDays = 30) {
  const url = `/api/account-profile.php?account_id=${encodeURIComponent(accountId)}&days=${days}`;
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/login.php";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<{
    error?: string;
    profile?: Record<string, unknown>;
  }>;
}

export async function updateCrashTriage(body: {
  crash_signature: string;
  status: string;
  notes?: string;
  fixed_in_version?: string;
}) {
  const res = await fetch("/api/triage-update.php", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    window.location.href = "/login.php";
    throw new Error("Unauthorized");
  }
  return res.json() as Promise<{
    ok?: boolean;
    error?: string;
    row?: Record<string, unknown>;
  }>;
}

export function formatNum(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString() : "—";
}

export function formatUpdatedAt(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Updated ${d.toLocaleString()}`;
}
