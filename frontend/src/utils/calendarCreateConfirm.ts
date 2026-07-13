/**
 * Calendar create confirmation — server-authoritative.
 *
 * Confirm/reject parsing lives in ``services.calendar.confirm`` (Python).
 * The renderer only stores draft shape for rehydrating the interactive card.
 */

/** UI draft shape stored on assistant messages while awaiting confirm. */
export interface CalendarEventDraft {
  title: string;
  startIso: string;
  endIso: string;
  sourceText: string;
  awaitingConfirm: boolean;
  connectedProviderIds: string[] | null;
  toolName?: string;
}
