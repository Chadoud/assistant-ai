import { describe, expect, it } from "vitest";
import { looksLikeUnfulfilledPromise, sanitizeUnbackedPromiseClaim } from "./chatPromiseGuard";

describe("chatPromiseGuard", () => {
  it("detects let me move promises", () => {
    expect(looksLikeUnfulfilledPromise("Let me move those emails for you.")).toBe(true);
  });

  it("detects on it / background promises", () => {
    expect(
      looksLikeUnfulfilledPromise(
        "Let me work through that. I'm on it, the process is running in the background.",
      ),
    ).toBe(true);
  });

  it("ignores plain informational answers", () => {
    expect(looksLikeUnfulfilledPromise("Your next meeting is at 3 PM.")).toBe(false);
  });

  it("ignores inability admissions", () => {
    expect(looksLikeUnfulfilledPromise("I can't move those emails without Gmail connected.")).toBe(
      false,
    );
  });

  it("replaces unbacked promises when no tool ran", () => {
    const fallback = "I couldn't complete that action.";
    expect(
      sanitizeUnbackedPromiseClaim("Let me move those emails for you.", false, fallback),
    ).toBe(fallback);
  });

  it("keeps text when a tool ran", () => {
    expect(
      sanitizeUnbackedPromiseClaim("Let me move those emails for you.", true, "fallback"),
    ).toBe("Let me move those emails for you.");
  });

  it("flags bare I'll commitments used by models on analysis replies", () => {
    // Documented false-positive shape: analysis turns must skip this guard in the stream handler.
    expect(
      looksLikeUnfulfilledPromise(
        "I'll highlight your strongest experience from the CV you shared.",
      ),
    ).toBe(true);
  });
});
