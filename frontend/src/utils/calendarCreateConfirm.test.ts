import { describe, expect, it } from "vitest";
import type { CalendarEventDraft } from "./calendarCreateConfirm";

describe("calendarCreateConfirm types", () => {
  it("accepts a minimal awaiting-confirm draft", () => {
    const draft: CalendarEventDraft = {
      title: "Standup",
      startIso: "2026-06-19T09:00:00+02:00",
      endIso: "2026-06-19T09:30:00+02:00",
      sourceText: "standup tomorrow 9am",
      awaitingConfirm: true,
      connectedProviderIds: ["google-gmail"],
    };
    expect(draft.awaitingConfirm).toBe(true);
  });
});
