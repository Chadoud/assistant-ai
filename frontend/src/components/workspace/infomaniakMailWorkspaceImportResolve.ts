/**
 * Infomaniak Mail workspace import resolver.
 * Loads messages from the Electron IPC listing (folders + optional date cutoff),
 * then yields one-message batches for progressive import (same pacing as Outlook).
 */

export type InfomaniakMailFolder = "Inbox" | "SentItems" | "AllMessages";

export type InfomaniakMailDateFilter = "any" | "7d" | "30d" | "since";

export type InfomaniakMailMergePrefs = {
  enabled: boolean;
  folder: InfomaniakMailFolder;
  dateFilter: InfomaniakMailDateFilter;
  sinceDate: string;
};

export type InfomaniakMailWorkspaceMessage = Record<string, unknown> & {
  id: string;
  mailbox: string;
  __folder: string;
};

export type ProgressiveInfomaniakMailImportBatch = {
  message: InfomaniakMailWorkspaceMessage;
  /** Stable total after listing completes — matches Outlook UX. */
  discoveredCount: number;
};

/** Map workspace folder selection to Electron list API folder token. */
function infomaniakMailFolderToken(folder: InfomaniakMailFolder): string {
  if (folder === "SentItems") return "SENT";
  if (folder === "AllMessages") return "ALL";
  return "INBOX";
}

function sinceMsForFilter(filter: InfomaniakMailDateFilter, sinceDate: string): number | null {
  if (filter === "any") return null;
  if (filter === "since") {
    const d = sinceDate.trim();
    if (!d) return null;
    const parsed = Date.parse(`${d}T00:00:00Z`);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const daysBack = filter === "7d" ? 7 : 30;
  return Date.now() - daysBack * 24 * 60 * 60 * 1000;
}

function stableIdFromRow(row: Record<string, unknown>): string {
  const v = row.uid ?? row.id ?? row.message_id ?? row.mailbox_message_id ?? "";
  return String(v ?? "").trim();
}

type ListInfomaniakMailMessagesFn = (payload: {
  mailbox?: string;
  folder: string;
  since?: number | null;
}) => Promise<
  | { ok: true; messages: Record<string, unknown>[] }
  | { ok: false; reason?: string }
>;

export async function* streamProgressiveInfomaniakMailImportBatches(
  prefs: InfomaniakMailMergePrefs,
  listFn: ListInfomaniakMailMessagesFn,
  options?: { signal?: AbortSignal }
): AsyncGenerator<ProgressiveInfomaniakMailImportBatch> {
  const signal = options?.signal;
  if (signal?.aborted) return;

  const sinceMs = sinceMsForFilter(prefs.dateFilter, prefs.sinceDate);
  const folder = infomaniakMailFolderToken(prefs.folder);
  const listRes = await listFn({ mailbox: "me", folder, since: sinceMs });
  if (!listRes.ok) {
    console.error("[infomaniakMailImportResolve] list failed:", listRes.reason);
    return;
  }

  /** @type {InfomaniakMailWorkspaceMessage[]} */
  const enriched: InfomaniakMailWorkspaceMessage[] = [];
  for (const rowRaw of listRes.messages) {
    const row = rowRaw as Record<string, unknown>;
    const id = stableIdFromRow(row);
    if (!id) continue;
    const folderSlugRaw = row.__folder;
    const slugFromApi = typeof folderSlugRaw === "string" && folderSlugRaw.trim() ? folderSlugRaw.trim() : "";
    const __folder =
      folder === "ALL" && slugFromApi ? slugFromApi : infomaniakMailFolderToken(prefs.folder);
    enriched.push({
      ...row,
      id,
      mailbox: "me",
      __folder,
    });
  }

  const total = enriched.length;
  for (let i = 0; i < enriched.length; i++) {
    if (signal?.aborted) return;
    yield { message: enriched[i]!, discoveredCount: total };
  }
}
