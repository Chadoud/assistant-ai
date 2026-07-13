import type { ConversationMessage } from "../../../hooks/useConversations";
import type { CalendarDeleteDraft } from "../../../utils/calendarDeleteConfirm";

/** Pending calendar create draft from the last awaiting-confirm assistant bubble. */
export function pendingCalendarDraft(
  messages: ConversationMessage[],
): Record<string, unknown> | null {
  const pending = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.calendarEventDraft?.awaitingConfirm);
  if (!pending?.calendarEventDraft) return null;
  const d = pending.calendarEventDraft;
  return {
    title: d.title,
    summary: d.title,
    startIso: d.startIso,
    endIso: d.endIso,
    start: d.startIso,
    end: d.endIso,
    sourceText: d.sourceText,
    source_text: d.sourceText,
    awaitingConfirm: true,
    tool_name: d.toolName ?? "google_workspace",
  };
}

/** Pending calendar delete draft (typed) from the last awaiting-confirm assistant bubble. */
export function pendingCalendarDeleteDraftUi(
  messages: ConversationMessage[],
): CalendarDeleteDraft | null {
  const pending = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.calendarDeleteDraft?.awaitingConfirm);
  return pending?.calendarDeleteDraft ?? null;
}

/** Pending calendar delete draft from the last awaiting-confirm assistant bubble. */
export function pendingCalendarDeleteDraft(
  messages: ConversationMessage[],
): Record<string, unknown> | null {
  const pending = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.calendarDeleteDraft?.awaitingConfirm);
  if (!pending?.calendarDeleteDraft) return null;
  const d = pending.calendarDeleteDraft;
  return {
    summary: d.summary,
    title: d.summary,
    startIso: d.startIso,
    endIso: d.endIso,
    start: d.startIso,
    end: d.endIso,
    eventId: d.eventId,
    event_id: d.eventId,
    recurringEventId: d.recurringEventId,
    recurring_event_id: d.recurringEventId,
    isRecurring: d.isRecurring,
    is_recurring: d.isRecurring,
    recurrenceLabel: d.recurrenceLabel,
    recurrence_label: d.recurrenceLabel,
    sourceText: d.sourceText,
    source_text: d.sourceText,
    toolName: d.toolName,
    tool_name: d.toolName,
    calendarId: d.calendarId,
    calendar_id: d.calendarId,
    standaloneEventIds: d.standaloneEventIds,
    standalone_event_ids: d.standaloneEventIds,
    additionalSeries: d.additionalSeries,
    additional_series: d.additionalSeries?.map((target) => ({
      event_id: target.eventId,
      recurring_event_id: target.recurringEventId,
      summary: target.summary,
      start: target.startIso,
      end: target.endIso,
    })),
    awaitingConfirm: true,
    needsScope: d.needsScope,
    scopeOptions: d.scopeOptions,
  };
}
