import { describe, expect, it } from "vitest";
import { buildContextForTurn } from "./buildContextFromTurn";
import type { AssistantTurnJsonResponse } from "../api/assistantTurn";
import type { AppSettings } from "../types/settings";

const baseSettings = {
  assistantToolsEnabled: true,
  assistantAgentEnabled: true,
} as AppSettings;

describe("buildContextForTurn", () => {
  it("uses server calendar prefetch without IPC", async () => {
    const turn: AssistantTurnJsonResponse = {
      mode: "action",
      intent: "read_calendar",
      action: "client_calendar_read",
      prefetch_calendar_events: [
        { summary: "Team sync", start: "2026-06-18T10:00:00Z" },
      ],
    };
    const ctx = await buildContextForTurn(turn, "what's on my calendar today", baseSettings, null);
    expect(ctx.calendarRows).toHaveLength(1);
    expect(ctx.calendarRows[0].events).toHaveLength(1);
    expect(ctx.calendarRows[0].events[0].summary).toBe("Team sync");
    expect(ctx.anyProviderAttempted).toBe(false);
  });

  it("uses server mail prefetch for read_mail", async () => {
    const turn: AssistantTurnJsonResponse = {
      mode: "action",
      intent: "read_mail",
      action: "client_mail_read",
      prefetch_mail_messages: [
        { subject: "Invoice #42", from: "billing@acme.test", date: "Mon" },
      ],
    };
    const ctx = await buildContextForTurn(turn, "show my invoices", baseSettings, null);
    expect(ctx.mailRows).toHaveLength(1);
    expect(ctx.mailRows[0].messages[0].subject).toBe("Invoice #42");
    expect(ctx.anyProviderAttempted).toBe(true);
  });
});
