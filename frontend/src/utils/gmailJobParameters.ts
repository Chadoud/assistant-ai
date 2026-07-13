import type { GmailImportContent } from "../api/gmail";
import { GMAIL_EXPORT_MAX_MESSAGES } from "../constants";
import {
  buildGmailQueryFromSelection,
  GMAIL_SELECTION_ALL_MAIL,
  parseGmailQueryToSelectionIds,
} from "./gmailSearchCategories";

const GMAIL_INBOX_SCOPE_NOTE =
  "When the search includes in:inbox, Gmail lists messages with the Inbox label, including every category tab (Primary, Social, Promotions, Updates, Forums). It does not include mail that never had the Inbox label (for example only in Sent, Trash, or removed from Inbox by a filter).";

const GMAIL_ALL_MAIL_SCOPE_NOTE =
  "in:anywhere includes messages across your mailbox (all labels). Your max-messages cap and Gmail API limits still apply.";

/**
 * JSON snapshot of Gmail import UI choices, stored on the job and repeated in the sort-plan CSV.
 */
export function buildGmailJobUiParametersJson(input: {
  query: string;
  maxMessages: number;
  importMaxCap: number;
  importContent: GmailImportContent;
}): string {
  const selection = parseGmailQueryToSelectionIds(input.query);
  const canonicalGmailQuery = buildGmailQueryFromSelection(selection);
  const serverCap = Math.min(GMAIL_EXPORT_MAX_MESSAGES, Math.max(1, input.importMaxCap));
  const maxMessagesUnlimited = input.maxMessages >= serverCap;
  const lowerQ = (input.query || "").toLowerCase();
  const canonicalLower = canonicalGmailQuery.toLowerCase();
  const allMailInScope =
    selection.has(GMAIL_SELECTION_ALL_MAIL) || canonicalLower.includes("in:anywhere");
  const inboxInScope =
    (lowerQ.includes("in:inbox") || canonicalLower.includes("in:inbox")) && !allMailInScope;
  return JSON.stringify({
    version: 1,
    scopeTokenIds: [...selection].sort(),
    canonicalGmailQuery,
    importContent: input.importContent,
    maxMessages: input.maxMessages,
    serverMaxMessagesCap: serverCap,
    maxMessagesUnlimited,
    allMailInScope,
    allMailInScopeNote: allMailInScope ? GMAIL_ALL_MAIL_SCOPE_NOTE : null,
    inboxInScopeNote: inboxInScope ? GMAIL_INBOX_SCOPE_NOTE : null,
  });
}
