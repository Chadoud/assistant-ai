/** Human-readable sync source labels for the Today hub drawer. */

type SyncSourceKey =
  | "gmail"
  | "outlook"
  | "google_calendar"
  | "outlook_calendar"
  | string;

type SyncStatusValue = "ok" | "not_connected" | "unavailable" | string;

interface SyncStatusLine {
  sourceKey: SyncSourceKey;
  sourceLabel: string;
  status: SyncStatusValue;
  newCount: number;
  message: string;
  showConnect: boolean;
}

interface LabelFns {
  sourceLabel: (key: SyncSourceKey) => string;
  statusNew: (n: number) => string;
  statusNotConnected: string;
  statusUnavailable: string;
}

/** Build drawer rows from raw sync report payload. */
export function buildSyncStatusLines(
  statuses: Record<string, string> | undefined,
  created: Record<string, number> | undefined,
  labels: LabelFns,
): SyncStatusLine[] {
  if (!statuses) return [];
  return Object.entries(statuses).map(([key, status]) => {
    const newCount = created?.[key] ?? 0;
    const sourceLabel = labels.sourceLabel(key);
    let message: string;
    let showConnect = false;
    if (status === "ok") {
      message = newCount > 0 ? `${sourceLabel}: ${labels.statusNew(newCount)}` : `${sourceLabel}: OK`;
    } else if (status === "not_connected") {
      message = `${sourceLabel} — ${labels.statusNotConnected}`;
      showConnect = true;
    } else {
      message = `${sourceLabel} — ${labels.statusUnavailable}`;
    }
    return { sourceKey: key, sourceLabel, status, newCount, message, showConnect };
  });
}

export function totalNewFromCreated(created: Record<string, number> | undefined): number {
  if (!created) return 0;
  return Object.values(created).reduce((n, c) => n + c, 0);
}
