/**
 * Outlook workspace import resolver.
 *
 * Fetches pages of mail from a folder (Graph API), applies a date filter,
 * then yields one message per batch for progressive import.
 */

export type OutlookDateFilter = "any" | "7d" | "30d" | "since";
export type OutlookFolder = "Inbox" | "SentItems" | "AllMessages";

export type OutlookMessage = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  hasAttachments?: boolean;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
};

export type OutlookMergePrefs = {
  enabled: boolean;
  folder: OutlookFolder;
  dateFilter: OutlookDateFilter;
  sinceDate: string;
  includeAttachments: boolean;
};

export type ProgressiveOutlookImportBatch = {
  message: OutlookMessage;
  /** Stable count after all pages fetched; increases as pages arrive. */
  discoveredCount: number;
};


type ListOutlookMessagesFn = (payload: {
  folder?: string;
  since?: string;
  nextLink?: string;
  pageSize?: number;
}) => Promise<
  | { ok: true; messages: OutlookMessage[]; nextLink?: string }
  | { ok: false; reason?: string }
>;

/** Convert a local date-only string ("YYYY-MM-DD") to an ISO 8601 datetime for Graph $filter. */
function sinceDateToIso(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  return `${dateStr}T00:00:00Z`;
}

function sinceDateForFilter(
  dateFilter: OutlookDateFilter,
  sinceDate: string
): string | undefined {
  if (dateFilter === "any") return undefined;
  if (dateFilter === "since") return sinceDateToIso(sinceDate);
  const daysBack = dateFilter === "7d" ? 7 : 30;
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString();
}

/**
 * Yields one-message batches for progressive import.
 *
 * Phase 1: pages through Graph, collecting all message stubs.
 * Phase 2: yields one message per batch so the caller can import + stream progress.
 */
export async function* streamProgressiveOutlookImportBatches(
  prefs: OutlookMergePrefs,
  listFn: ListOutlookMessagesFn,
  options?: { signal?: AbortSignal }
): AsyncGenerator<ProgressiveOutlookImportBatch> {
  const signal = options?.signal;
  if (signal?.aborted) return;

  const since = sinceDateForFilter(prefs.dateFilter, prefs.sinceDate);
  const all: OutlookMessage[] = [];
  let nextLink: string | undefined;

  // Collect all pages first (Graph returns up to 100 per page; we use 50 by default).
  do {
    if (signal?.aborted) return;
    const result = await listFn({
      folder: prefs.folder,
      since,
      nextLink,
      pageSize: 50,
    });
    if (!result.ok) {
      console.error("[outlookImportResolve] list failed:", result.reason);
      return;
    }
    all.push(...result.messages);
    nextLink = result.nextLink;
  } while (nextLink);

  // Yield one message per batch.
  for (const message of all) {
    if (signal?.aborted) return;
    yield { message, discoveredCount: all.length };
  }
}
