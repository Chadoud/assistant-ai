/**
 * Prefetch and deeplink helpers for assistant UI (not routing authority).
 * Server routes text chat via POST /assistant/turn; these remain for cards and IPC prefetch.
 */

import { MS_GRAPH_PROVIDER_IDS } from "../assistant/connectorContext";
import { chatBrandAssetUrl } from "../brands/chatBrandAssetUrl";

const CODEGEN_TASK_RE =
  /\b(create|build|make|generate|scaffold|implement|write)\b[\s\S]{0,120}\b(app(?:lication)?|project|website|web\s+app|chat\s+app|codebase|program|demo|prototype|mvp)\b|\b(react|typescript|tailwind|vite|next\.?js|vue|svelte|angular)\b[\s\S]{0,200}\b(component|app\.tsx|npm\s+install|deliverables?)\b|\bgenerate\s+all\s+source\s+code\b|\bnpm\s+install[\s\S]{0,60}npm\s+run\s+dev\b/i;

/**
 * Speech-to-text often turns "app" into "up" ("build a cool up").
 * Normalize only the article+up pattern so "build up confidence" stays untouched.
 */
function normalizeCodegenSpeechTypos(text: string): string {
  return text
    .replace(/\b(a|an|the|my|our|some|cool)\s+up\b/gi, "$1 app")
    .replace(/\bup\s+for\s+(our|the|a|my)\s+demo\b/gi, "app for $1 demo");
}

/** True when the message is a multi-file code / app build request. */
export function isCodegenTask(text: string): boolean {
  return CODEGEN_TASK_RE.test(normalizeCodegenSpeechTypos(text.trim()));
}

/** @deprecated Use isCodegenTask — all codegen routes to Codegen Studio. */
export function isCodegenDeliverablesTask(text: string): boolean {
  return isCodegenTask(text);
}

const TIME_FOLLOW_UP_RE =
  /^(?:à\s+)?(?:midi|minuit|noon|midnight|matin|soir|\d{1,2}\s*h(?:eures?)?|\d{1,2}:\d{2}|(?:une|1)\s+heure(?:s)?)(?:\s+pour\s+(?:une|1)\s+heure(?:s)?)?\.?$/i;

export function isTimeFollowUpReply(text: string): boolean {
  return TIME_FOLLOW_UP_RE.test(text.trim());
}

export function mergeCalendarWriteContext(
  previousUserMessage: string | null | undefined,
  currentMessage: string,
): string {
  const cur = currentMessage.trim();
  const prev = (previousUserMessage ?? "").trim();
  if (!prev || !isTimeFollowUpReply(cur)) return cur;
  if (cur.toLowerCase().includes(prev.toLowerCase().slice(0, 24))) return cur;
  const timeFragment = /^(midi|minuit|noon|midnight)$/i.test(cur) ? `à ${cur}` : cur;
  return `${prev} ${timeFragment}`.trim();
}

// ── Public: calendar window ───────────────────────────────────────────────────

/** Day indices: 0 = Sunday … 6 = Saturday. */
const WEEKDAY_MAP: ReadonlyArray<[RegExp, number]> = [
  [/\b(sunday|dimanche|sonntag|domenica)\b/i, 0],
  [/\b(monday|lundi|montag|luned[iì])\b/i, 1],
  [/\b(tuesday|mardi|dienstag|marted[iì])\b/i, 2],
  [/\b(wednesday|mercredi|mittwoch|mercoled[iì])\b/i, 3],
  [/\b(thursday|jeudi|donnerstag|gioved[iì])\b/i, 4],
  [/\b(friday|vendredi|freitag|venerd[iì])\b/i, 5],
  [/\b(saturday|samedi|samstag|sabato)\b/i, 6],
];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Returns the next occurrence of targetDayIndex after (not including) fromDate. */
function nextWeekdayAfter(targetDayIndex: number, fromDate: Date): Date {
  const diff = ((targetDayIndex - fromDate.getDay() + 7) % 7) || 7;
  return addDays(fromDate, diff);
}

/**
 * Compute the calendar fetch window `[startIso, endIso)` from a user message.
 *
 * Handles: today, tomorrow, named weekdays (EN/FR/DE/IT), this week, next week,
 * and falls back to a 7-day window when no temporal clue is found.
 */
export function computeCalendarWindow(
  text: string,
  now: Date = new Date()
): { startIso: string; endIso: string } {
  const today = startOfDay(now);

  if (/\b(today|aujourd'?hui|heute|oggi)\b/i.test(text)) {
    return { startIso: today.toISOString(), endIso: addDays(today, 1).toISOString() };
  }

  if (/\b(tomorrow|demain|morgen|domani)\b/i.test(text)) {
    const tomorrow = addDays(today, 1);
    return { startIso: tomorrow.toISOString(), endIso: addDays(tomorrow, 1).toISOString() };
  }

  if (/\b(next\s+week|la\s+semaine\s+prochaine|n[äa]chste[n]?\s+woche|la\s+settimana\s+prossima)\b/i.test(text)) {
    const monday = nextWeekdayAfter(1, today);
    return { startIso: monday.toISOString(), endIso: addDays(monday, 7).toISOString() };
  }

  for (const [pattern, dayIndex] of WEEKDAY_MAP) {
    if (pattern.test(text)) {
      const targetDay = nextWeekdayAfter(dayIndex, today);
      return { startIso: targetDay.toISOString(), endIso: addDays(targetDay, 1).toISOString() };
    }
  }

  // "this week" or default → 7-day window from today
  return { startIso: today.toISOString(), endIso: addDays(today, 7).toISOString() };
}

// ── Public: calendar write deeplinks ─────────────────────────────────────────

export interface CalendarDeeplink {
  provider: "google" | "outlook";
  label: string;
  url: string;
  logoSrc: string;
}

/** Trailing date/time phrases stripped from an extracted event title. */
const EVENT_TITLE_TEMPORAL_TAIL_RE =
  /\s+(?:(?:on|for|le|la|this|next|ce|cette)\s+)?(?:today|tomorrow|tonight|demain|aujourd'?hui|heute|morgen|oggi|domani|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)(?:\s+(?:at|à|um|alle)\s+(?:\d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?|\d{1,2}h(?:\d{2})?|midi|noon|minuit|midnight))?\s*$/i;

/** Leading calendar-write boilerplate removed before treating the remainder as the title. */
const EVENT_CREATE_PREFIX_RE =
  /^(?:.*?\b(?:create|schedule|book|set\s+up|add|cr[eé]er?|planifier|pianificare|erstell(?:en|e)?|anlegen)\s+(?:an?\s+|un\s+|une\s+)?(?:new\s+)?(?:calendar\s+)?(?:event|meeting|appointment|reminder|rendez-vous|r[eé]union|[eé]v[eè]nement|termin|appuntamento)\s*)(.*)$/i;

function normalizeEventTitleCandidate(raw: string): string {
  let candidate = raw.replace(/\s+/g, " ").trim();
  if (!candidate) return "";

  candidate = candidate.replace(EVENT_TITLE_TEMPORAL_TAIL_RE, "").trim();
  candidate = candidate.replace(
    /\s+(?:at|à|um|alle)\s+(?:\d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?|\d{1,2}h(?:\d{2})?|midi|noon|minuit|midnight)\s*$/i,
    "",
  ).trim();

  if (candidate.length < 3 || candidate.length > 80) return "";
  return candidate.charAt(0).toUpperCase() + candidate.slice(1);
}

/**
 * Attempt to extract a human-readable event title from a write-intent message.
 * Returns an empty string when nothing confident can be found.
 */
export function extractEventTitleFromText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const quoted = trimmed.match(/["""''']([^"""''']{2,80})["""''']/);
  if (quoted) return normalizeEventTitleCandidate(quoted[1]);

  // "… : acheter bourbon à Turinsev" — colon separates scheduling hints from the subject.
  const colonMatch = trimmed.match(/:\s*([^:\n]{3,80})$/);
  if (colonMatch) {
    const fromColon = normalizeEventTitleCandidate(colonMatch[1]);
    if (fromColon) return fromColon;
  }

  // "create an event for buy bourbon", "créer un événement pour …", "meeting about …"
  const subjectMatch = trimmed.match(
    /\b(?:called|titled|named|about|for|regarding|concerning|pour|sur|über|riguardo|to)\s+(.{3,80})$/i,
  );
  if (subjectMatch) {
    const fromSubject = normalizeEventTitleCandidate(subjectMatch[1]);
    if (fromSubject) return fromSubject;
  }

  // "schedule a meeting with Sam", "book a call with Alex"
  const withMatch = trimmed.match(/\bwith\s+(.{2,80})$/i);
  if (withMatch) {
    const fromWith = normalizeEventTitleCandidate(withMatch[1]);
    if (fromWith) return fromWith;
  }

  // Strip "create an event …" and use whatever meaningful text remains.
  const withoutPrefix = trimmed.replace(EVENT_CREATE_PREFIX_RE, "$1").trim();
  if (withoutPrefix && withoutPrefix !== trimmed) {
    const fromRemainder = normalizeEventTitleCandidate(withoutPrefix);
    if (fromRemainder) return fromRemainder;
  }

  return "";
}

/**
 * Build provider-specific deeplinks for creating a calendar event.
 * Opens Outlook Web or Google Calendar with a pre-filled compose form.
 *
 * When connectedProviderIds is null (no bridge or unavailable), both links are shown
 * so the user can pick whichever calendar they use.
 */
export function buildCalendarDeeplinks(
  connectedProviderIds: Set<string> | null,
  suggestedTitle: string,
  startIso: string
): CalendarDeeplink[] {
  const links: CalendarDeeplink[] = [];
  const titleParam = encodeURIComponent(suggestedTitle || "New event");
  const endIso = new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();

  const googleConnected =
    connectedProviderIds === null || connectedProviderIds.has("google-calendar");
  if (googleConnected) {
    const gcStart = startIso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const gcEnd = endIso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    links.push({
      provider: "google",
      label: "Google Calendar",
      url: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titleParam}&dates=${gcStart}/${gcEnd}`,
      logoSrc: chatBrandAssetUrl("google-calendar.png"),
    });
  }

  const outlookConnected =
    connectedProviderIds === null ||
    MS_GRAPH_PROVIDER_IDS.some((id) => connectedProviderIds.has(id));
  if (outlookConnected) {
    links.push({
      provider: "outlook",
      label: "Outlook Calendar",
      url: `https://outlook.office.com/calendar/action/compose?subject=${titleParam}&startdt=${encodeURIComponent(startIso)}&enddt=${encodeURIComponent(endIso)}`,
      logoSrc: chatBrandAssetUrl("outlook.png"),
    });
  }

  return links;
}

// ── Mail write deeplinks ──────────────────────────────────────────────────────

/** Verb phrases that indicate the user wants to send or compose an email. */
const MAIL_WRITE_RE =
  /\b(send\s+(?:an?\s+)?(?:email|mail|message)|reply\s+to|forward|compose|write\s+(?:an?\s+)?(?:email|mail)|respond\s+to|envoyer\s+(?:un\s+)?(?:e?-?mail|message)|répondre\s+à|répondre\s+a|rédiger|r[eé]pondre|schreiben|senden|antworten|invia[re]+|rispondi\s+a|scrivi\s+(?:una?\s+)?(?:email|mail))\b/i;

export function isMailWriteIntent(text: string): boolean {
  return MAIL_WRITE_RE.test(text);
}

export interface MailComposeDeeplink {
  provider: "gmail" | "outlook";
  label: string;
  url: string;
  logoSrc: string;
}

/**
 * Extract a rough subject/recipient from a mail write intent message.
 * Returns empty strings when nothing confident is found.
 */
export function extractMailComposeParamsFromText(text: string): { subject: string; to: string; body: string } {
  const quoted = text.match(/["""''']([^"""''']{2,80})["""''']/);
  const subject = quoted ? quoted[1].trim() : "";

  const toMatch = text.match(/\b(?:to|à|an|a)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/);
  const to = toMatch ? toMatch[1].trim() : "";

  const aboutMatch = text.match(/\b(?:about|regarding|re:|concerning|sur|über|riguardo)\s+(.{3,60})/i);
  const body = aboutMatch ? aboutMatch[1].trim() : "";

  return { subject, to, body };
}

/**
 * Build compose deeplinks for Gmail and Outlook Web.
 * Shows providers based on which mail services are connected.
 */
export function buildMailComposeDeeplinks(
  connectedProviderIds: Set<string> | null,
  subject: string,
  to: string,
  body: string
): MailComposeDeeplink[] {
  const links: MailComposeDeeplink[] = [];

  const gmailConnected =
    connectedProviderIds === null || connectedProviderIds.has("google-gmail");
  if (gmailConnected) {
    const params = new URLSearchParams();
    if (to) params.set("to", to);
    if (subject) params.set("su", subject);
    if (body) params.set("body", body);
    links.push({
      provider: "gmail",
      label: "Gmail",
      url: `https://mail.google.com/mail/?view=cm&${params.toString()}`,
      logoSrc: chatBrandAssetUrl("gmail.svg"),
    });
  }

  const outlookConnected =
    connectedProviderIds === null ||
    MS_GRAPH_PROVIDER_IDS.some((id) => connectedProviderIds.has(id));
  if (outlookConnected) {
    const url = new URL("https://outlook.office.com/mail/deeplink/compose");
    if (to) url.searchParams.set("to", to);
    if (subject) url.searchParams.set("subject", subject);
    if (body) url.searchParams.set("body", body);
    links.push({
      provider: "outlook",
      label: "Outlook Mail",
      url: url.toString(),
      logoSrc: chatBrandAssetUrl("outlook.png"),
    });
  }

  return links;
}

// ── Time extraction ───────────────────────────────────────────────────────────

/**
 * Parse a wall-clock time from natural-language text.
 * Understands: "at 9pm", "at 14:30", "à 9h", "à 14h30", "um 9 Uhr", "alle 9".
 * Returns null when no time is found.
 */
export function extractEventTimeFromText(text: string): { hour: number; minute: number } | null {
  // ISO-style or colon-format: "14:30", "9:00"
  const colonMatch = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { hour: h, minute: m };
  }

  // "at 9pm" / "at 9 pm" / "at 9 AM"
  const amPmMatch = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (amPmMatch) {
    let h = parseInt(amPmMatch[1], 10);
    const m = amPmMatch[2] ? parseInt(amPmMatch[2], 10) : 0;
    const meridiem = amPmMatch[3].toLowerCase();
    if (meridiem === "pm" && h < 12) h += 12;
    if (meridiem === "am" && h === 12) h = 0;
    if (h >= 0 && h <= 23) return { hour: h, minute: m };
  }

  // French: "à midi", "a midi", "à minuit" — \b is unreliable before accented letters in JS.
  if (/(?:^|\s)(?:à|a)\s+midi\b/i.test(text)) return { hour: 12, minute: 0 };
  if (/(?:^|\s)(?:à|a)\s+minuit\b/i.test(text)) return { hour: 0, minute: 0 };

  // English: "at noon", "at midnight"
  if (/\bat\s+noon\b/i.test(text)) return { hour: 12, minute: 0 };
  if (/\bat\s+midnight\b/i.test(text)) return { hour: 0, minute: 0 };

  // French: "à 9h30", "à 14h", "a 9h"
  const frMatch = text.match(/[aà]\s+(\d{1,2})h(\d{2})?/i);
  if (frMatch) {
    const h = parseInt(frMatch[1], 10);
    const m = frMatch[2] ? parseInt(frMatch[2], 10) : 0;
    if (h >= 0 && h <= 23) return { hour: h, minute: m };
  }

  // German: "um 9 Uhr", "um 14:30 Uhr"
  const deMatch = text.match(/\bum\s+(\d{1,2})(?::(\d{2}))?\s*(?:uhr)?/i);
  if (deMatch) {
    const h = parseInt(deMatch[1], 10);
    const m = deMatch[2] ? parseInt(deMatch[2], 10) : 0;
    if (h >= 0 && h <= 23) return { hour: h, minute: m };
  }

  // Italian: "alle 9", "alle 14:30"
  const itMatch = text.match(/\balle\s+(\d{1,2})(?::(\d{2}))?/i);
  if (itMatch) {
    const h = parseInt(itMatch[1], 10);
    const m = itMatch[2] ? parseInt(itMatch[2], 10) : 0;
    if (h >= 0 && h <= 23) return { hour: h, minute: m };
  }

  return null;
}

/**
 * Derive the best start ISO for a calendar write intent.
 * Combines the computed window date with any extracted wall-clock time.
 * Falls back to 09:00 local time when no time is found.
 */
export function buildEventStartIso(text: string): string {
  const { startIso } = computeCalendarWindow(text);
  const time = extractEventTimeFromText(text);

  // startIso is midnight local — replace with extracted or default time
  const base = new Date(startIso);
  base.setHours(time?.hour ?? 9, time?.minute ?? 0, 0, 0);
  return base.toISOString();
}

/**
 * Render grounded calendar event rows as a compact text block for LLM system prompts.
 * Used when mixing a calendar read with another intent (e.g. read_both) so the LLM
 * gets real data rather than guessing.
 */
export function calendarContextForSystemPrompt(
  calendarRows: Array<{ provider: string; events: Array<{ summary?: string; title?: string; start?: string; end?: string }> }>
): string {
  if (calendarRows.length === 0) return "";

  const lines: string[] = ["=== CALENDAR DATA (DO NOT INVENT OR MODIFY) ==="];
  for (const row of calendarRows) {
    lines.push(`${row.provider}:`);
    if (row.events.length === 0) {
      lines.push("  No events found.");
    } else {
      for (const ev of row.events) {
        const title = ev.summary || ev.title || "(No title)";
        lines.push(`  - ${ev.start ?? "?"} → ${ev.end ?? "?"} : ${title}`);
      }
    }
  }
  lines.push("=== END CALENDAR DATA ===");
  return lines.join("\n");
}

// ── Mail search query builder ──────────────────────────────────────────────────

/**
 * Category patterns for deriving a targeted mail search query from the user's
 * natural-language question. Each entry maps a regex to a Gmail search string
 * (which Outlook's $search also understands for keyword matching).
 */
const MAIL_CATEGORY_QUERIES: Array<{ re: RegExp; query: string }> = [
  {
    re: /\b(invoices?|factures?|rechnung|rechnungen|fattur[ae]|inv-?\d|inv\b)\b/i,
    query: "(invoice OR facture OR Rechnung OR fattura)",
  },
  {
    re: /\b(bills?|new bill|billings?|quittung(?:en)?)\b/i,
    query: "(invoice OR bill OR billing OR facture)",
  },
  {
    re: /\b(receipts?|ricevut[ae]|quittung)\b/i,
    query: "(receipt OR ricevuta OR Quittung)",
  },
  {
    re: /\b(payments?|pagament[oi]|zahlung(?:en)?|transaction|transactions?)\b/i,
    query: "(payment OR transaction OR pagamento OR Zahlung OR refund OR charge)",
  },
  {
    re: /\b(contracts?|agreements?|nda|contrat|vertrag|contratt[oi])\b/i,
    query: "(contract OR agreement OR NDA OR contrat OR Vertrag)",
  },
  {
    re: /\b(statements?|bank statement|account statement|relevé)\b/i,
    query: "(statement OR 'bank statement' OR 'account statement')",
  },
];

/**
 * Derive a targeted Gmail / Outlook search string from the user's message.
 *
 * Returns a non-empty string when a specific financial/document category is
 * detected, so the API fetches only relevant messages rather than the whole inbox.
 * Returns `""` for general queries — the caller will fall back to the default
 * recap query.
 */
export function buildMailSearchQuery(text: string): string {
  for (const { re, query } of MAIL_CATEGORY_QUERIES) {
    if (re.test(text)) {
      // Gmail native date limit — 30 days for financial docs (invoices can be older than 14d)
      return `${query} newer_than:30d`;
    }
  }
  return "";
}
