import { describe, expect, it } from "vitest";
import {
  looksLikeFalseCalendarCompletion,
  sanitizeUnbackedCalendarClaim,
} from "./chatFalseCompletionGuard";

describe("chatFalseCompletionGuard", () => {
  it("detects French false calendar completion", () => {
    expect(
      looksLikeFalseCalendarCompletion(
        "Je l'ai ajouté à votre calendrier pour demain à midi pour une heure.",
      ),
    ).toBe(true);
  });

  it("leaves normal answers alone", () => {
    expect(looksLikeFalseCalendarCompletion("Your next meeting is at 3 PM.")).toBe(false);
  });

  it("replaces unbacked claims when no tool ran", () => {
    const out = sanitizeUnbackedCalendarClaim(
      "I've added it to your calendar for tomorrow.",
      false,
      "Could not create the event.",
    );
    expect(out).toBe("Could not create the event.");
  });

  it("keeps text when a tool was called", () => {
    const original = "I've added it to your calendar for tomorrow.";
    expect(sanitizeUnbackedCalendarClaim(original, true, "fallback")).toBe(original);
  });
});
