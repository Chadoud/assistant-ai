/**
 * Calendar delete confirmation — server-authoritative scope selection.
 */

export type RecurrenceScope = "this_instance" | "this_and_following" | "all_series";

export interface SeriesDeleteTarget {
  eventId: string;
  recurringEventId?: string | null;
  summary: string;
  startIso: string;
  endIso: string;
}

/** UI draft shape stored on assistant messages while awaiting delete confirm. */
export interface CalendarDeleteDraft {
  summary: string;
  startIso: string;
  endIso: string;
  eventId: string;
  recurringEventId?: string | null;
  isRecurring: boolean;
  recurrenceLabel?: string | null;
  sourceText: string;
  toolName: string;
  calendarId: string;
  standaloneEventIds: string[];
  additionalSeries?: SeriesDeleteTarget[];
  awaitingConfirm: boolean;
  needsScope: boolean;
  scopeOptions?: RecurrenceScope[] | null;
}

/** Build request draft payload for POST /integrations/calendar/events/confirm-delete. */
export function deleteDraftToApiPayload(draft: CalendarDeleteDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    tool_name: draft.toolName,
    calendar_id: draft.calendarId,
    event_id: draft.eventId,
    recurring_event_id: draft.recurringEventId ?? undefined,
    summary: draft.summary,
    start: draft.startIso,
    end: draft.endIso,
    is_recurring: draft.isRecurring,
    recurrence_label: draft.recurrenceLabel ?? undefined,
    source_text: draft.sourceText,
    standalone_event_ids: draft.standaloneEventIds,
    awaitingConfirm: true,
  };
  if (draft.additionalSeries?.length) {
    payload.additional_series = draft.additionalSeries.map((target) => ({
      event_id: target.eventId,
      recurring_event_id: target.recurringEventId ?? undefined,
      summary: target.summary,
      start: target.startIso,
      end: target.endIso,
    }));
  }
  return payload;
}

/** Normalize server turn payload into UI draft shape. */
export function calendarDeleteDraftFromTurn(
  raw: Record<string, unknown>,
): CalendarDeleteDraft {
  const recurringRaw = raw.recurringEventId ?? raw.recurring_event_id;
  const recurrenceLabelRaw = raw.recurrenceLabel ?? raw.recurrence_label;
  const standaloneRaw = raw.standaloneEventIds ?? raw.standalone_event_ids;
  const scopeRaw = raw.scopeOptions ?? raw.scope_options;
  const additionalRaw = raw.additionalSeries ?? raw.additional_series;

  const additionalSeries = Array.isArray(additionalRaw)
    ? additionalRaw
        .map((item): SeriesDeleteTarget | null => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const eventId = String(row.eventId ?? row.event_id ?? "").trim();
          if (!eventId) return null;
          const recurringRow = row.recurringEventId ?? row.recurring_event_id;
          return {
            eventId,
            recurringEventId:
              recurringRow == null || recurringRow === "" ? null : String(recurringRow),
            summary: String(row.summary ?? ""),
            startIso: String(row.startIso ?? row.start ?? ""),
            endIso: String(row.endIso ?? row.end ?? ""),
          };
        })
        .filter((item): item is SeriesDeleteTarget => item !== null)
    : undefined;

  return {
    summary: String(raw.summary ?? raw.title ?? ""),
    startIso: String(raw.startIso ?? raw.start ?? ""),
    endIso: String(raw.endIso ?? raw.end ?? ""),
    eventId: String(raw.eventId ?? raw.event_id ?? ""),
    recurringEventId:
      recurringRaw == null || recurringRaw === ""
        ? null
        : String(recurringRaw),
    isRecurring: Boolean(raw.isRecurring ?? raw.is_recurring),
    recurrenceLabel:
      recurrenceLabelRaw == null || recurrenceLabelRaw === ""
        ? null
        : String(recurrenceLabelRaw),
    sourceText: String(raw.sourceText ?? raw.source_text ?? ""),
    toolName: String(raw.toolName ?? raw.tool_name ?? "google_workspace"),
    calendarId: String(raw.calendarId ?? raw.calendar_id ?? "primary"),
    standaloneEventIds: Array.isArray(standaloneRaw)
      ? standaloneRaw.map((id) => String(id))
      : [],
    additionalSeries: additionalSeries?.length ? additionalSeries : undefined,
    awaitingConfirm: Boolean(raw.awaitingConfirm ?? true),
    needsScope: Boolean(raw.needsScope ?? raw.needs_scope),
    scopeOptions: Array.isArray(scopeRaw)
      ? (scopeRaw as RecurrenceScope[])
      : null,
  };
}
