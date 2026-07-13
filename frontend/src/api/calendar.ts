import { request } from "./client";

/** Shared calendar create/confirm contract (matches backend CalendarCreateResponse). */
type CalendarCreateStatus =
  | "needs_confirmation"
  | "needs_input"
  | "created"
  | "cancelled"
  | "failed";

interface CalendarDraftPayload {
  summary: string;
  start: string;
  end: string;
  tool_name: string;
}

interface CalendarCreateResponse {
  ok: boolean;
  status: CalendarCreateStatus;
  recap?: string;
  draft?: CalendarDraftPayload;
  missing?: "time" | "title";
  error?: string;
  data?: Record<string, unknown>;
}

interface ProposeCalendarEventParams {
  source_text: string;
  tool_name?: string;
  summary?: string;
  start?: string;
  end?: string;
}

interface ConfirmCalendarEventParams {
  tool_name: string;
  summary: string;
  start: string;
  end: string;
  source_text?: string;
  title_field?: string;
  args?: Record<string, unknown>;
}

interface CreateCalendarEventParams {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  provider?: "google" | "microsoft";
}

interface CreateCalendarEventResult {
  ok: boolean;
  data?: {
    event_id?: string;
    html_link?: string;
    web_link?: string;
  };
  error?: string;
}

/** Propose a calendar event — returns needs_confirmation or needs_input from the server. */
export async function proposeCalendarEvent(
  params: ProposeCalendarEventParams,
): Promise<CalendarCreateResponse> {
  try {
    return await request<CalendarCreateResponse>("/integrations/calendar/events/propose", {
      method: "POST",
      body: JSON.stringify(params),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Calendar propose failed";
    return { ok: false, status: "failed", error: message };
  }
}

/** Create a confirmed calendar event via the unified CalendarService. */
export async function confirmCalendarEvent(
  params: ConfirmCalendarEventParams,
): Promise<CalendarCreateResponse> {
  try {
    return await request<CalendarCreateResponse>("/integrations/calendar/events/confirm", {
      method: "POST",
      body: JSON.stringify(params),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Calendar confirm failed";
    return { ok: false, status: "failed", error: message };
  }
}

type CalendarDeleteStatus =
  | "needs_confirmation"
  | "needs_scope"
  | "cancelled"
  | "deleted"
  | "failed";

interface CalendarDeleteDraftPayload {
  tool_name: string;
  calendar_id: string;
  event_id: string;
  recurring_event_id?: string | null;
  summary: string;
  start: string;
  end: string;
  is_recurring?: boolean;
  recurrence_label?: string | null;
  source_text?: string;
  standalone_event_ids?: string[];
  awaitingConfirm?: boolean;
}

interface CalendarDeleteResponse {
  ok: boolean;
  status: CalendarDeleteStatus;
  recap?: string;
  draft?: CalendarDeleteDraftPayload;
  scope_options?: Array<"this_instance" | "this_and_following" | "all_series">;
  deleted_count?: number;
  error?: string;
  data?: Record<string, unknown>;
}

interface ConfirmCalendarDeleteParams {
  draft: Record<string, unknown>;
  user_reply?: string;
  scope?: "this_instance" | "this_and_following" | "all_series";
}

/** Execute a confirmed calendar delete with optional recurrence scope. */
export async function confirmCalendarDelete(
  params: ConfirmCalendarDeleteParams,
): Promise<CalendarDeleteResponse> {
  try {
    return await request<CalendarDeleteResponse>("/integrations/calendar/events/confirm-delete", {
      method: "POST",
      body: JSON.stringify(params),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Calendar delete confirm failed";
    return { ok: false, status: "failed", error: message };
  }
}

/** Create a calendar event via the connected Google or Microsoft account. */
export async function createCalendarEvent(
  params: CreateCalendarEventParams,
): Promise<CreateCalendarEventResult> {
  try {
    return await request<CreateCalendarEventResult>("/integrations/calendar/events", {
      method: "POST",
      body: JSON.stringify(params),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Calendar create failed";
    return { ok: false, error: message };
  }
}
