/**
 * System prompt builders and calendar/mail context renderers for the assistant.
 *
 * Extracted from AssistantChatPanel so they can be tested independently and
 * imported without pulling in any React or component dependencies.
 */

import { buildAssistantToolAppendix } from "./toolAppendix";
import { calendarContextForSystemPrompt } from "./assistantIntent";

// ── Shared types (re-exported for consumers) ──────────────────────────────────

export interface CalendarEvent {
  /** Title — populated as "summary" by both Google Calendar and Outlook (after our mapping fix). */
  summary?: string;
  /** Legacy alias used by some older paths; prefer summary. */
  title?: string;
  start?: string;
  end?: string;
  isAllDay?: boolean;
  location?: string;
  organizer?: string;
  bodyPreview?: string;
  onlineMeetingUrl?: string;
  importance?: string;
  showAs?: string;
  categories?: string[];
}

export interface MailMessage {
  subject?: string;
  from?: string;
  date?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  isImportant?: boolean;
  /** Outlook only: message is in the Focused tab of the split inbox */
  isFocused?: boolean;
}

export interface CalendarRow {
  provider: string;
  events: CalendarEvent[];
  loadError?: string;
  gateReason?: string;
}

export interface MailRow {
  provider: string;
  messages: MailMessage[];
  /** Non-null when the IPC call failed or returned a non-ok response. */
  loadError?: string;
}

export interface FetchedContext {
  /** Legacy shape used by mail prompt builder (populated from mailRows successes). */
  calendars: Array<{ provider: string; events: CalendarEvent[] }>;
  mail: Array<{ provider: string; messages: MailMessage[] }>;
  /** Per-source mail result (including API errors — mirrors calendarRows pattern). */
  mailRows: MailRow[];
  /** True if at least one mail IPC returned successfully. */
  anyProviderAttempted: boolean;
  /** Per-source calendar result (including API errors). */
  calendarRows: CalendarRow[];
  /** Set when we cannot run calendar IPC at all. */
  calendarBlockedReason?: "no_bridge" | "assistant_off";
  /** No calendar provider is connected under External sources. */
  calendarNoLinkedAccounts?: boolean;
  /** Human-readable label for the calendar window (used in "no events" copy). */
  calendarWindowLabel?: "today" | "tomorrow" | "week";
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/**
 * Calendar date for mail recap headings: "2025 Dec 13" (no leading zero on day).
 */
export function formatMailRecapCalendarDate(isoStr: string): string {
  try {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(isoStr)
      ? new Date(`${isoStr}T12:00:00`)
      : new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    const mon = d.toLocaleDateString("en-US", { month: "short" });
    return `${d.getFullYear()} ${mon} ${d.getDate()}`;
  } catch {
    return "";
  }
}

export function formatEventDateTime(isoStr: string | undefined, isAllDay?: boolean): string {
  if (!isoStr) return "";
  try {
    // All-day events: display as a date only (no time)
    if (isAllDay || /^\d{4}-\d{2}-\d{2}$/.test(isoStr)) {
      const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(isoStr) ? isoStr : isoStr.slice(0, 10);
      return new Date(dateStr + "T00:00:00").toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (isToday) return timeStr;
    return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} ${timeStr}`;
  } catch {
    return isoStr;
  }
}

// ── Gate / load error mappers ─────────────────────────────────────────────────

export function mapGateReasonToUserMessage(
  reason: string | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  switch (reason) {
    case "assistant_disabled":
      return t("assistant.calendarEnableActions");
    case "read_disabled":
      return t("assistant.calendarReadDisabled");
    case "provider_microsoft":
      return t("assistant.calendarGateMicrosoft");
    case "provider_google":
      return t("assistant.calendarGateGoogle");
    case "provider_infomaniak":
      return t("assistant.calendarGateInfomaniak");
    default:
      return t("assistant.calendarReasonUnknown");
  }
}

const CALENDAR_LOAD_INTERNAL_CODES = new Set([
  "google_calendar_not_linked",
  "microsoft_not_linked",
  "infomaniak_calendar_not_linked",
  "token_unavailable",
  "ipc_error",
  "calendar_failed",
]);

function sanitizeCalendarProviderReason(reason: string): string {
  return reason.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

export function mapCalendarLoadErrorToUserMessage(
  reason: string | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  switch (reason) {
    case "google_calendar_not_linked":
    case "microsoft_not_linked":
    case "infomaniak_calendar_not_linked":
      return t("assistant.calendarReasonNotLinked");
    case "microsoft_calendar_access_denied":
      return t("assistant.calendarMicrosoftAccessDenied");
    case "token_unavailable":
      return t("assistant.calendarReasonToken");
    case "ipc_error":
      return t("assistant.calendarReasonUnknown");
    case "calendar_failed":
      return t("assistant.calendarReasonApi");
    default:
      break;
  }
  const trimmed = reason?.trim();
  if (!trimmed) return t("assistant.calendarReasonUnknown");
  if (CALENDAR_LOAD_INTERNAL_CODES.has(trimmed)) return t("assistant.calendarReasonUnknown");

  const detail = sanitizeCalendarProviderReason(trimmed);
  if (detail.length < 2) return t("assistant.calendarReasonUnknown");

  const low = detail.toLowerCase();
  if (low.includes("access is denied") && low.includes("credentials")) {
    return t("assistant.calendarMicrosoftAccessDenied");
  }
  if (
    low.includes("invalid_grant") ||
    low.includes("access_denied") ||
    low.includes("invalid_authentication") ||
    low.includes("insufficient") ||
    low.includes("consent_required") ||
    low.includes("interaction_required") ||
    low.includes("unauthorized")
  ) {
    return t("assistant.calendarReasonToken");
  }

  return t("assistant.calendarProviderDetail", { message: detail });
}

// ── Calendar renderer (deterministic, no LLM) ─────────────────────────────────

/**
 * Format calendar events directly as text grouped by source.
 * `ctx.calendarWindowLabel` makes "no events" copy date-aware.
 */
export function renderCalendarContext(
  ctx: FetchedContext,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  if (ctx.calendarBlockedReason === "no_bridge") return t("assistant.calendarNeedDesktop");
  if (ctx.calendarBlockedReason === "assistant_off") return t("assistant.calendarEnableActions");
  if (ctx.calendarNoLinkedAccounts) return t("assistant.calendarNoAccountsLinked");

  const rows = ctx.calendarRows;
  if (!rows.length) return t("assistant.calendarReasonUnknown");

  const lines: string[] = [];
  let sawEvents = false;
  let loadFailures = 0;
  let gateBlocks = 0;

  for (const row of rows) {
    lines.push(row.provider);

    if (row.gateReason) {
      gateBlocks += 1;
      lines.push(`  ${mapGateReasonToUserMessage(row.gateReason, t)}`);
      lines.push("");
      continue;
    }

    if (row.loadError) {
      loadFailures += 1;
      const detail = mapCalendarLoadErrorToUserMessage(row.loadError, t);
      lines.push(`  ${t("assistant.calendarLoadFailed", { detail })}`);
      lines.push("");
      continue;
    }

    if (row.events.length === 0) {
      const noEventsKey =
        ctx.calendarWindowLabel === "today"
          ? "assistant.calendarNoEventsToday"
          : ctx.calendarWindowLabel === "tomorrow"
          ? "assistant.calendarNoEventsTomorrow"
          : "assistant.calendarNoEventsInWindow";
      lines.push(`  ${t(noEventsKey)}`);
    } else {
      sawEvents = true;
      for (const ev of row.events) {
        const title = ev.summary || ev.title || "(No title)";
        const start = formatEventDateTime(ev.start, ev.isAllDay);
        const end = ev.end ? formatEventDateTime(ev.end, ev.isAllDay) : "";

        const badges: string[] = [];
        if (ev.isAllDay) badges.push("all day");
        if (ev.onlineMeetingUrl) badges.push("Teams");
        if (ev.showAs && ev.showAs !== "busy" && ev.showAs !== "free") badges.push(ev.showAs);
        if (ev.importance === "high") badges.push("!");
        if (ev.categories && ev.categories.length > 0) badges.push(...ev.categories.slice(0, 2));
        const badgeStr = badges.length > 0 ? ` [${badges.join(", ")}]` : "";

        const loc = ev.location ? ` · ${ev.location}` : "";
        const preview =
          ev.bodyPreview && ev.bodyPreview.length > 5 && ev.bodyPreview !== title
            ? `\n    ${ev.bodyPreview.slice(0, 120)}`
            : "";

        lines.push(`  • ${start}${end && !ev.isAllDay ? ` → ${end}` : ""} — ${title}${loc}${badgeStr}${preview}`);
      }
    }
    lines.push("");
  }

  if (sawEvents) return lines.join("\n").trimEnd();

  if (loadFailures > 0 && loadFailures + gateBlocks === rows.length) {
    return t("assistant.calendarAllSourcesFailed") + "\n\n" + lines.join("\n").trimEnd();
  }

  if (gateBlocks > 0 && gateBlocks === rows.length) {
    if (rows.every((r) => r.gateReason === "read_disabled")) {
      return t("assistant.calendarReadDisabled");
    }
  }

  return lines.join("\n").trimEnd();
}

// ── System prompt builders ────────────────────────────────────────────────────

/**
 * Build a grounded system prompt for mail recap.
 * All real emails are enumerated — the LLM cannot invent new ones.
 *
 * @param ctx - Fetched mail/calendar context.
 * @param userQuery - The original user question, used to focus the recap on the
 *   right category (e.g. "what are my latest invoices" → skip security alerts).
 */
export function buildMailRecapSystemPrompt(ctx: FetchedContext, userQuery = ""): string {
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // When the user asks about a specific document/financial category, only show
  // emails relevant to that category. Security/sign-in notifications are not
  // relevant for an "invoices" query and should be skipped.
  const isSpecificCategory = /\b(invoices?|bills?|receipts?|payments?|transactions?|contracts?|agreements?|statements?|factures?|rechnung|fattur[ae]|ricevut[ae]|pagament[oi]|contratt[oi])\b/i.test(userQuery);

  const userQueryLine = userQuery.trim()
    ? `The user asked: "${userQuery.trim()}". Focus the recap on emails directly relevant to this question.`
    : "";

  const lines: string[] = [
    `You are a smart email assistant. Today is ${dateStr}.`,
    ...(userQueryLine ? [userQueryLine, ""] : [""]),
    "Your task: read the emails below and write a short, clear recap.",
    "Surface only what is genuinely worth the user's attention.",
    "",
    "INCLUDE ONLY emails that fall into one of these categories:",
    "  - Money: payments, failed charges, refunds, invoices, receipts, bank or card statements",
    "  - Contracts: signed documents, agreements, legal notices, NDAs",
    "  - Meetings: calendar invites, meeting requests, scheduling confirmations, interview confirmations",
    "  - Work: messages from colleagues, clients, employers — business communication",
    "  - Personal: messages from real known humans (family, friends, contacts)",
    ...(isSpecificCategory
      ? []
      : ["  - Security: new sign-in alerts, permission changes, account access notifications"]),
    "  Also always include emails marked [IMPORTANT] or [FOCUSED] in the list.",
    "",
    "SKIP everything else:",
    "  - Newsletters, digests, marketing, promotional offers",
    "  - Social network notifications (GitHub, LinkedIn activity, etc.)",
    "  - Automated system notifications that require no human action (login alerts from apps, service status updates)",
    "  - Password-reset or verification emails the user did not request",
    "  - Bulk / no-reply senders with no actionable content",
    ...(isSpecificCategory
      ? ["  - Security / sign-in notifications — not relevant for this query"]
      : []),
    "",
    "Rules:",
    '1. GROUP by calendar day using the bracketed date from each line below. For each distinct day, output one line that is ONLY a date in this exact shape: YYYY Mon D (three-letter English month, day with no leading zero), for example "2025 Dec 13" or "2026 Mar 7". Sort days newest first.',
    '2. Under each date, use "- " bullets. Never start a bullet with "From " or "You have an email from". Lead with the topic or action; mention the sender only in parentheses at the end if useful.',
    "3. Grouping: if 3 or more messages share the same sender and a similar subject line, collapse them into a single line like: 3× SwissAligner invoices.",
    "4. When ALL included emails fall into the SKIP categories, say so briefly — for example: 'No relevant invoices found in the last 30 days.' Do not invent any emails.",
    "5. ONLY mention emails that appear in the list below. Never invent subjects, senders, or dates.",
    '6. Use at most 15 "- " bullets per provider section (date heading lines do not count).',
    "7. Plain text only — do not use Markdown. Never write ** asterisks or other bold markers.",
    '8. CRITICAL: Start the Outlook section with a line containing EXACTLY and ONLY these two words: Outlook Mail — nothing else, no counts, no parentheses. Start the Gmail section with a line containing EXACTLY and ONLY one word: Gmail — nothing else, no counts, no parentheses.',
    "",
    "=== REAL EMAILS FROM CONNECTED ACCOUNTS ===",
    "",
  ];

  if (!ctx.anyProviderAttempted || ctx.mail.length === 0) {
    lines.push("(No mail accounts connected or no messages retrieved.)");
  } else {
    for (const { provider, messages } of ctx.mail) {
      lines.push(`--- ${provider} ---`);
      if (messages.length === 0) {
        lines.push("No messages.");
      } else {
        for (const m of messages) {
          const subject = m.subject?.trim() || "(no subject)";
          const from = m.from?.trim() || "unknown sender";
          const date = m.date ? formatMailRecapCalendarDate(m.date) : "";
          const flags = [
            m.isRead === false ? "unread" : "",
            m.hasAttachments ? "has attachments" : "",
            m.isImportant ? "IMPORTANT" : "",
            m.isFocused ? "FOCUSED" : "",
          ]
            .filter(Boolean)
            .join(", ");
          lines.push(`• [${date || "no date"}] "${subject}" — from ${from}${flags ? ` (${flags})` : ""}`);
        }
      }
      lines.push("");
    }
  }

  lines.push("=== END OF EMAIL LIST ===");
  lines.push("");
  lines.push(
    "ABSOLUTE RULE: Every email you mention in your response MUST appear verbatim in the list above. " +
      "If an email subject, sender, or date does not appear in the list, do NOT write it. " +
      "If the list is empty or says 'No messages', say you found no emails — do not invent any."
  );
  return lines.join("\n");
}

/**
 * Build a grounded system prompt for mail manage actions (block, filter, move to spam).
 */
export function buildMailManageSystemPrompt(ctx: FetchedContext, userQuery = ""): string {
  const recapBlock = buildMailRecapSystemPrompt(ctx, userQuery);
  const lines: string[] = [
    "You are helping the user stop unwanted email from a sender or domain.",
    "",
    "When the user wants to stop receiving mail (block, filter, unsubscribe, move to spam):",
    "1. Identify the sender or domain from their request (e.g. chess.com → from:chess.com).",
    "2. Call google_workspace with search_mail to find matching messages if needed.",
    "3. Call google_workspace move_mail_batch to move existing messages to Spam (add_labels: [\"SPAM\"], remove_labels: [\"INBOX\"]).",
    "4. Call google_workspace create_filter so future messages from that sender skip the inbox (criteria.from = sender/domain).",
    "5. Report a plain-language outcome with counts — e.g. \"Moved 13 Chess.com emails to Spam and added a filter.\"",
    "",
    "Rules:",
    "- ACT with tools — do not say \"let me\" without calling a tool in the same turn.",
    "- Never claim a filter or move succeeded unless the tool returned ok.",
    "- For unsubscribe requests, prefer create_filter + move_mail_batch over web browsing.",
    "- Do NOT use plan_and_execute for single-sender mail cleanup.",
    "- If Gmail is not connected, say so plainly.",
    "",
    recapBlock,
  ];
  return lines.join("\n");
}

export function buildDefaultSystemPrompt(memoryBlock?: string): string {
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const toolAppendix = buildAssistantToolAppendix();
  const parts: string[] = [];

  if (memoryBlock) {
    parts.push(memoryBlock, "");
  }

  parts.push(
    `You are a helpful personal AI assistant inside Exo. Today is ${dateStr}.`,
    "",
    "UNDERSTAND, DON'T DICTATE — THIS APPLIES TO ALL DATA YOU RECEIVE:",
    "When you present fetched data (emails, calendar events, search results, tool output) do NOT read it back verbatim.",
    "Understand it, then tell the user the highlights in your own words — lead with what matters, group similar items, skip noise (newsletters, marketing, automated notifications).",
    "Be brief and conversational. Never invent data not present in the source; if a section is empty, say so plainly.",
    "",
    "Your primary purpose is helping users organise and sort their files.",
    "",
    "THE APP HAS EXACTLY THESE SECTIONS — do not invent any others:",
    "  Assistant (this chat), Sort files, Results, History, External sources, Settings.",
    "Financial mail (invoices, bills, receipts, payments, contracts) is accessed through linked Gmail/Outlook in External sources — or by asking here so you can search mail read-only when tools are enabled.",
    "If the user asks about invoices, bills, receipts, or payments, point them to External sources for linked accounts or use Assistant mail search when permitted.",
    "Do NOT invent tabs or sections beyond those listed above.",
    "",
    "You can:",
    "- Answer questions about the Sort files workflow, AI classification, and output folders.",
    "- Help the user navigate to one of the real sections above (use the system commands below).",
    "- Read calendar events and emails from connected accounts (no invention).",
    "- When assistant tools are enabled, ACT on the user's behalf by calling the available tools: send emails, create/edit/cancel calendar events, move/label mail, and organise files on connected Google/Microsoft accounts.",
    "- Remember things the user tells you by calling save_memory.",
    "",
    "When the user asks for an action you have a tool for, call the tool and do it — do not refuse or redirect them to the voice assistant. Only if assistant tools are turned off should you tell them to enable Assistant tools in Settings (or use the voice assistant).",
    "CRITICAL: Never invent, guess, or fabricate calendar events, email subjects, senders, file paths, app sections, or any real-world data. If you do not have the actual data, say so explicitly.",
    "",
    "CONVERSATION HISTORY RULES:",
    "- Every 'assistant' message above in this conversation is something YOU wrote in a prior turn.",
    "- You MUST treat prior assistant messages as your own prior output — you can quote, summarise, translate, or continue from them freely.",
    "- When the user asks 'translate what you just wrote', 'the text you made', 'celui que tu viens de faire', 'celui-là', 'it', 'this', 'that speech', etc., they are referring to your most recent assistant message. Look at it and use it.",
    "- Never claim you have no prior response or no prior speech when one appears in the conversation history above.",
    "",
    toolAppendix,
  );
  return parts.join("\n");
}

/**
 * Build a combined system prompt for mixed (read_both) queries.
 * Calendar data is injected verbatim so the LLM never has to guess.
 */
export function buildMixedSystemPrompt(ctx: FetchedContext, userQuery = ""): string {
  const calendarBlock = calendarContextForSystemPrompt(ctx.calendarRows);
  const mailPrompt = buildMailRecapSystemPrompt(ctx, userQuery);
  return calendarBlock ? calendarBlock + "\n\n" + mailPrompt : mailPrompt;
}
