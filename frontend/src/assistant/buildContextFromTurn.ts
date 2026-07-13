/**
 * Build FetchedContext from server prefetch payloads — avoids duplicate IPC when
 * POST /assistant/turn already listed calendar or mail data.
 */

import type { AssistantTurnJsonResponse } from "../api/assistantTurn";
import type { AssistantIntent } from "../systemCommands/assistantIntent";
import type { AppSettings } from "../types/settings";
import { fetchRealContext } from "./connectorContext";
import type {
  CalendarEvent,
  FetchedContext,
  MailMessage,
} from "../systemCommands/assistantPrompts";

function mapCalendarEvents(raw: Array<Record<string, unknown>>): CalendarEvent[] {
  return raw.map((e) => ({
    summary: String(e.summary ?? e.title ?? ""),
    title: String(e.summary ?? e.title ?? ""),
    start: String(e.start ?? ""),
    end: String(e.end ?? ""),
    location: e.location ? String(e.location) : undefined,
  }));
}

function mapMailMessages(raw: Array<Record<string, unknown>>): MailMessage[] {
  return raw.map((m) => ({
    subject: m.subject ? String(m.subject) : undefined,
    from: m.from ? String(m.from) : undefined,
    date: m.date ? String(m.date) : undefined,
    isRead: typeof m.isRead === "boolean" ? m.isRead : undefined,
    isImportant: typeof m.isImportant === "boolean" ? m.isImportant : undefined,
  }));
}

/**
 * Resolve calendar/mail context for a unified turn, preferring server prefetch.
 */
export async function buildContextForTurn(
  turn: AssistantTurnJsonResponse,
  text: string,
  settings: AppSettings,
  previousUserMessage: string | null,
): Promise<FetchedContext> {
  const intent = (turn.intent ?? "generic_chat") as AssistantIntent;
  const hasCalendarPrefetch = Boolean(turn.prefetch_calendar_events?.length);
  const hasMailPrefetch = Boolean(turn.prefetch_mail_messages?.length);

  if (hasCalendarPrefetch && !hasMailPrefetch && intent === "read_calendar") {
    const events = mapCalendarEvents(turn.prefetch_calendar_events!);
    return {
      calendars: [{ provider: "Google Calendar", events }],
      calendarRows: [{ provider: "Google Calendar", events }],
      mail: [],
      mailRows: [],
      anyProviderAttempted: false,
      calendarWindowLabel: /\btomorrow\b/i.test(text) ? "tomorrow" : /\btoday\b/i.test(text) ? "today" : "week",
    };
  }

  if (hasMailPrefetch && intent === "read_mail") {
    const messages = mapMailMessages(turn.prefetch_mail_messages!);
    return {
      calendars: [],
      calendarRows: [],
      mail: [{ provider: "Gmail", messages }],
      mailRows: [{ provider: "Gmail", messages }],
      anyProviderAttempted: true,
    };
  }

  return fetchRealContext(text, settings, previousUserMessage, intent);
}
