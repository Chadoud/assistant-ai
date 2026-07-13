import { describe, expect, it } from "vitest";
import {
  attachCalendarDeleteDraftToMessages,
  calendarDeleteDraftFromToolResult,
} from "./calendarDeleteDraftFromToolResult";
import type { ConversationMessage } from "../hooks/useConversations";

describe("calendarDeleteDraftFromToolResult", () => {
  it("extracts needs_scope draft from google_workspace tool result", () => {
    const draft = calendarDeleteDraftFromToolResult("google_workspace", {
      ok: true,
      data: {
        status: "needs_scope",
        draft: {
          summary: "WORK",
          start: "2026-06-18T10:00:00+02:00",
          end: "2026-06-18T11:00:00+02:00",
          event_id: "evt1",
          is_recurring: true,
          tool_name: "google_workspace",
          calendar_id: "primary",
        },
        scope_options: ["this_instance", "all_series"],
      },
    });
    expect(draft?.summary).toBe("WORK");
    expect(draft?.needsScope).toBe(true);
    expect(draft?.awaitingConfirm).toBe(true);
  });

  it("returns null for unrelated tool results", () => {
    expect(calendarDeleteDraftFromToolResult("list_tasks", { ok: true })).toBeNull();
  });

  it("attaches draft to the latest assistant bubble", () => {
    const messages: ConversationMessage[] = [
      { id: "u1", role: "user", content: "delete work" },
      { id: "a1", role: "assistant", content: "Delete WORK on Wednesday?" },
    ];
    const draft = calendarDeleteDraftFromToolResult("google_workspace", {
      ok: true,
      data: {
        status: "needs_confirmation",
        draft: {
          summary: "WORK",
          start: "2026-06-18T10:00:00+02:00",
          end: "2026-06-18T11:00:00+02:00",
          event_id: "evt1",
          is_recurring: false,
          tool_name: "google_workspace",
          calendar_id: "primary",
        },
      },
    });
    expect(draft).not.toBeNull();
    const next = attachCalendarDeleteDraftToMessages(messages, draft!);
    expect(next[1].calendarDeleteDraft?.summary).toBe("WORK");
  });
});
