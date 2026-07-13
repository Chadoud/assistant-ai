import { describe, expect, it } from "vitest";
import { deriveCalendarAccessGuidanceFocus } from "./assistantAccessGuidance";

describe("deriveCalendarAccessGuidanceFocus", () => {
  it("returns master when assistant actions are off", () => {
    expect(
      deriveCalendarAccessGuidanceFocus({
        calendarBlockedReason: "assistant_off",
        calendarRows: [],
      })
    ).toBe("master");
  });

  it("returns null for browser-only (no bridge)", () => {
    expect(
      deriveCalendarAccessGuidanceFocus({
        calendarBlockedReason: "no_bridge",
        calendarRows: [{ events: [] }],
      })
    ).toBeNull();
  });

  it("prioritises read_integration when every row is read_disabled", () => {
    expect(
      deriveCalendarAccessGuidanceFocus({
        calendarRows: [
          { events: [], gateReason: "read_disabled" },
          { events: [], gateReason: "read_disabled" },
        ],
      })
    ).toBe("read_integration");
  });

  it("returns accounts_api when any loadError is present", () => {
    expect(
      deriveCalendarAccessGuidanceFocus({
        calendarRows: [
          { events: [], loadError: "calendar_failed" },
          { events: [], gateReason: "provider_google" },
        ],
      })
    ).toBe("accounts_api");
  });

  it("returns provider_scope when provider gates only", () => {
    expect(
      deriveCalendarAccessGuidanceFocus({
        calendarRows: [{ events: [], gateReason: "provider_google" }],
      })
    ).toBe("provider_scope");
  });

  it("returns null on empty rows without blocked reason", () => {
    expect(deriveCalendarAccessGuidanceFocus({ calendarRows: [] })).toBeNull();
  });
});
