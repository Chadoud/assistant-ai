import { describe, expect, it } from "vitest";
import {
  confirmCalendarEvent,
  createCalendarEvent,
  proposeCalendarEvent,
} from "./calendar";

describe("calendar API client", () => {
  it("exports propose, confirm, and create helpers", () => {
    expect(typeof proposeCalendarEvent).toBe("function");
    expect(typeof confirmCalendarEvent).toBe("function");
    expect(typeof createCalendarEvent).toBe("function");
  });
});
