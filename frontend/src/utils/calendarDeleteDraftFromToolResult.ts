import type { ConversationMessage } from "../hooks/useConversations";
import {
  calendarDeleteDraftFromTurn,
  deleteDraftToApiPayload,
  type CalendarDeleteDraft,
} from "./calendarDeleteConfirm";

const CALENDAR_TOOLS = new Set([
  "google_workspace",
  "microsoft_graph",
  "infomaniak_services",
]);

/**
 * Extract a pending delete draft from a voice Live tool_result payload.
 * Returns null when the result is not awaiting delete confirmation.
 */
export function calendarDeleteDraftFromToolResult(
  tool: string,
  result: unknown,
): CalendarDeleteDraft | null {
  if (!CALENDAR_TOOLS.has(tool.trim())) return null;
  if (!result || typeof result !== "object") return null;

  const payload = result as Record<string, unknown>;
  if (payload.ok !== true) return null;

  const data = payload.data;
  if (!data || typeof data !== "object") return null;

  const status = String((data as Record<string, unknown>).status ?? "");
  if (status !== "needs_scope" && status !== "needs_confirmation") return null;

  const draft = (data as Record<string, unknown>).draft;
  if (!draft || typeof draft !== "object") return null;

  const scopeOptions = (data as Record<string, unknown>).scope_options;
  return calendarDeleteDraftFromTurn({
    ...(draft as Record<string, unknown>),
    needsScope: status === "needs_scope",
    scopeOptions: Array.isArray(scopeOptions) ? scopeOptions : undefined,
    awaitingConfirm: true,
    toolName: tool,
  });
}

/** Attach a pending delete draft to the most recent assistant bubble. */
export function attachCalendarDeleteDraftToMessages(
  prev: ConversationMessage[],
  draft: CalendarDeleteDraft,
): ConversationMessage[] {
  for (let index = prev.length - 1; index >= 0; index -= 1) {
    const message = prev[index];
    if (message.role !== "assistant") continue;
    if (message.calendarDeleteDraft?.awaitingConfirm) return prev;
    return prev.map((msg, idx) =>
      idx === index ? { ...msg, calendarDeleteDraft: draft } : msg,
    );
  }
  return prev;
}

/** Build the voice WS sync payload from a UI delete draft. */
export function calendarDeleteDraftToSyncPayload(
  draft: CalendarDeleteDraft,
): Record<string, unknown> {
  return deleteDraftToApiPayload(draft);
}
