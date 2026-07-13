/**
 * Gmail inbox tab categories (`category:` operators).
 * @see https://support.google.com/mail/answer/6579
 */
export const GMAIL_TAB_CATEGORY_QUERIES = [
  "category:primary",
  "category:social",
  "category:promotions",
  "category:updates",
  "category:forums",
] as const;

export type GmailTabCategoryQuery = (typeof GMAIL_TAB_CATEGORY_QUERIES)[number];

/** UI id for "all mail in Inbox" (not the same as a single tab). */
export const GMAIL_SELECTION_ALL_INBOX = "all:inbox" as const;

/** UI id for Sent folder. */
const GMAIL_SELECTION_SENT = "in:sent" as const;

/** UI id for entire mailbox (Gmail ``in:anywhere``). */
export const GMAIL_SELECTION_ALL_MAIL = "all:mail" as const;

/** UI id for Spam folder. */
export const GMAIL_SELECTION_SPAM = "in:spam" as const;

/** Modifier: unread messages only. */
const GMAIL_MODIFIER_UNREAD = "is:unread" as const;

/** Modifier: starred messages only. */
const GMAIL_MODIFIER_STARRED = "is:starred" as const;

/** Default Gmail list scope: entire Inbox (all category tabs). */
export const GMAIL_QUERY_DEFAULT_INBOX = "in:inbox" as const;

/**
 * Legacy Primary-tab scope (inbox minus other category tabs). Still recognized when parsing saved
 * queries so older prefs map to {@link GMAIL_QUERY_DEFAULT_INBOX} on the server; the UI no longer
 * builds this string for the default "Inbox" preset.
 */
export const GMAIL_QUERY_INBOX_PRIMARY_TAB =
  "in:inbox -category:social -category:promotions -category:updates -category:forums";

function normalizeGmailQuerySpaces(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

/** `category:…` tokens that are not negated (`-category:` must not count as a selected tab). */
function positiveGmailCategoryTabs(lower: string): Set<GmailTabCategoryQuery> {
  const out = new Set<GmailTabCategoryQuery>();
  const re = /(?<![-\w])category:(primary|social|promotions|updates|forums)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(lower)) !== null) {
    const id = `category:${match[1].toLowerCase()}` as GmailTabCategoryQuery;
    if ((GMAIL_TAB_CATEGORY_QUERIES as readonly string[]).includes(id)) out.add(id);
  }
  return out;
}

/**
 * Builds a Gmail `q` string from checkbox tokens. Uses `OR` for multiple folder clauses,
 * then appends any active modifiers (is:unread, is:starred) as AND conditions.
 *
 * Folder logic:
 * - Inbox (all tabs) alone → `in:inbox`
 * - Sent alone → `in:sent`
 * - Spam alone → `in:spam`
 * - All mail (entire mailbox) → `in:anywhere` (exclusive, modifiers still apply)
 * - Multiple folders → `(in:inbox OR in:sent)` etc.
 * - Tab(s) within inbox → `in:inbox category:…` or `in:inbox (category:a OR category:b)`
 *
 * Modifier logic (appended with a space = AND in Gmail):
 * - `is:unread` → only unread messages in the selected scope
 * - `is:starred` → only starred messages in the selected scope
 */
export function buildGmailQueryFromSelection(ids: ReadonlySet<string>): string {
  // Collect active modifiers.
  const modifiers: string[] = [];
  if (ids.has(GMAIL_MODIFIER_UNREAD)) modifiers.push("is:unread");
  if (ids.has(GMAIL_MODIFIER_STARRED)) modifiers.push("is:starred");
  const modSuffix = modifiers.length > 0 ? ` ${modifiers.join(" ")}` : "";

  if (ids.has(GMAIL_SELECTION_ALL_MAIL)) {
    return `in:anywhere${modSuffix}`;
  }

  const hasAll = ids.has(GMAIL_SELECTION_ALL_INBOX);
  const hasSent = ids.has(GMAIL_SELECTION_SENT);
  const hasSpam = ids.has(GMAIL_SELECTION_SPAM);
  const cats = GMAIL_TAB_CATEGORY_QUERIES.filter((c) => ids.has(c));

  // Build inbox part (with optional tab scoping).
  const inboxPart = (() => {
    if (!hasAll && cats.length === 0) return null;
    if (hasAll || cats.length === 0) return "in:inbox";
    if (cats.length === 1 && cats[0] === "category:primary") return "in:inbox";
    if (cats.length === 1) return `in:inbox ${cats[0]}`;
    return `in:inbox (${cats.join(" OR ")})`;
  })();

  // Collect all folder parts.
  const parts: string[] = [];
  if (inboxPart) parts.push(inboxPart);
  if (hasSent) parts.push("in:sent");
  if (hasSpam) parts.push("in:spam");

  if (parts.length === 0) {
    return `${GMAIL_QUERY_DEFAULT_INBOX}${modSuffix}`;
  }
  if (parts.length === 1) {
    return `${parts[0]}${modSuffix}`;
  }
  return `(${parts.join(" OR ")})${modSuffix}`;
}

/**
 * Best-effort parse of a saved `gmail_query` into checkbox ids for the UI.
 * Unknown shapes fall back to full Inbox.
 */
export function parseGmailQueryToSelectionIds(q: string): Set<string> {
  const raw = q.trim();
  if (!raw) return new Set<string>([GMAIL_SELECTION_ALL_INBOX]);

  const lower = normalizeGmailQuerySpaces(raw);
  const out = new Set<string>();

  // Extract and remove modifiers before folder parsing.
  if (/\bis:unread\b/.test(lower)) out.add(GMAIL_MODIFIER_UNREAD);
  if (/\bis:starred\b/.test(lower)) out.add(GMAIL_MODIFIER_STARRED);
  const stripped = lower.replace(/\bis:unread\b/g, "").replace(/\bis:starred\b/g, "").replace(/\s+/g, " ").trim();

  if (stripped === "in:anywhere" || stripped === "(in:anywhere)") {
    out.add(GMAIL_SELECTION_ALL_MAIL);
    return out;
  }

  if (stripped === "category:primary") {
    out.add(GMAIL_SELECTION_ALL_INBOX);
    return out;
  }

  if (stripped === normalizeGmailQuerySpaces(GMAIL_QUERY_INBOX_PRIMARY_TAB)) {
    out.add(GMAIL_SELECTION_ALL_INBOX);
    return out;
  }

  if (stripped === "in:inbox" || stripped === "(in:inbox)") {
    out.add(GMAIL_SELECTION_ALL_INBOX);
    return out;
  }

  if (stripped === "in:sent" || stripped === "(in:sent)") {
    out.add(GMAIL_SELECTION_SENT);
    return out;
  }

  if (stripped === "in:spam" || stripped === "(in:spam)") {
    out.add(GMAIL_SELECTION_SPAM);
    return out;
  }

  // Multi-folder combinations.
  if (stripped.includes("in:inbox")) out.add(GMAIL_SELECTION_ALL_INBOX);
  if (stripped.includes("in:sent")) out.add(GMAIL_SELECTION_SENT);
  if (stripped.includes("in:spam")) out.add(GMAIL_SELECTION_SPAM);

  // Inbox-scoped tab categories: "in:inbox category:…" shapes.
  if (stripped.startsWith("in:inbox ") && !stripped.startsWith("(in:inbox or")) {
    const tabs = positiveGmailCategoryTabs(stripped);
    if (tabs.size > 0) {
      // Tab-scoped: replace the generic all-inbox token with the tab tokens.
      out.delete(GMAIL_SELECTION_ALL_INBOX);
      for (const t of tabs) out.add(t);
    }
  }

  // Tab-scoped combined with spam: "(in:inbox category:… OR in:spam)"
  const positiveTabs = positiveGmailCategoryTabs(stripped);
  if (positiveTabs.size > 0 && stripped.includes("in:inbox")) {
    out.delete(GMAIL_SELECTION_ALL_INBOX);
    for (const t of positiveTabs) out.add(t);
  }

  // Legacy bare category: queries with no folder prefix, e.g. "(category:primary OR category:promotions)".
  // Treat as inbox-scoped tab selection — old Gmail UI emitted these without the in:inbox prefix.
  if (positiveTabs.size > 0 && !stripped.includes("in:inbox") && !stripped.includes("in:sent") && !stripped.includes("in:spam")) {
    out.delete(GMAIL_SELECTION_ALL_INBOX);
    for (const t of positiveTabs) out.add(t);
  }

  const modifierOnlyCount =
    (out.has(GMAIL_MODIFIER_UNREAD) ? 1 : 0) + (out.has(GMAIL_MODIFIER_STARRED) ? 1 : 0);
  if (out.size === 0 || modifierOnlyCount === out.size) {
    out.add(GMAIL_SELECTION_ALL_INBOX);
  }

  return out;
}
