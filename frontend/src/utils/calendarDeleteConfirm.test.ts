import { describe, expect, it } from "vitest";
import {
  calendarDeleteDraftFromTurn,
  deleteDraftToApiPayload,
  type CalendarDeleteDraft,
} from "./calendarDeleteConfirm";

describe("calendarDeleteConfirm", () => {
  it("maps turn payload to UI draft", () => {
    const draft = calendarDeleteDraftFromTurn({
      summary: "Weekly standup",
      startIso: "2026-06-18T10:00:00+02:00",
      endIso: "2026-06-18T10:30:00+02:00",
      eventId: "evt1",
      isRecurring: true,
      needsScope: true,
      scopeOptions: ["this_instance", "all_series"],
      toolName: "google_workspace",
    });
    expect(draft.summary).toBe("Weekly standup");
    expect(draft.needsScope).toBe(true);
    expect(draft.scopeOptions).toEqual(["this_instance", "all_series"]);
  });

  it("maps additional series from turn payload", () => {
    const draft = calendarDeleteDraftFromTurn({
      summary: "WORK",
      startIso: "2026-06-18T08:00:00+02:00",
      endIso: "2026-06-18T12:00:00+02:00",
      eventId: "w1",
      isRecurring: true,
      needsScope: true,
      toolName: "google_workspace",
      additionalSeries: [
        {
          eventId: "w2",
          recurringEventId: "series-b",
          summary: "WORK",
          startIso: "2026-06-18T14:00:00+02:00",
          endIso: "2026-06-18T18:00:00+02:00",
        },
      ],
    });
    expect(draft.additionalSeries).toHaveLength(1);
    expect(draft.additionalSeries?.[0].eventId).toBe("w2");
  });

  it("builds confirm-delete API payload with additional series", () => {
    const draft: CalendarDeleteDraft = {
      summary: "WORK",
      startIso: "2026-06-18T08:00:00+02:00",
      endIso: "2026-06-18T12:00:00+02:00",
      eventId: "w1",
      recurringEventId: "series-a",
      isRecurring: true,
      sourceText: "delete all WORK events",
      toolName: "google_workspace",
      calendarId: "primary",
      standaloneEventIds: [],
      additionalSeries: [
        {
          eventId: "w2",
          recurringEventId: "series-b",
          summary: "WORK",
          startIso: "2026-06-18T14:00:00+02:00",
          endIso: "2026-06-18T18:00:00+02:00",
        },
      ],
      awaitingConfirm: true,
      needsScope: true,
    };
    const payload = deleteDraftToApiPayload(draft);
    expect(Array.isArray(payload.additional_series)).toBe(true);
    expect((payload.additional_series as unknown[]).length).toBe(1);
  });
});
