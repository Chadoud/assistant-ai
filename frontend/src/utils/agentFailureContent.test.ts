import { describe, expect, it } from "vitest";
import { buildAgentFailureRetryPrompt, parseAgentFailureContent } from "./agentFailureContent";

describe("parseAgentFailureContent", () => {
  it("splits goal and outcome", () => {
    const parsed = parseAgentFailureContent(
      'Goal: Delete WORK events\nOutcome: No calendar tool was available.',
    );
    expect(parsed.goal).toBe("Delete WORK events");
    expect(parsed.outcome).toBe("No calendar tool was available.");
  });

  it("returns raw text when format is unknown", () => {
    const parsed = parseAgentFailureContent("Something unexpected happened.");
    expect(parsed.goal).toBe("Something unexpected happened.");
    expect(parsed.outcome).toBe("");
  });
});

describe("buildAgentFailureRetryPrompt", () => {
  it("includes goal and outcome when both exist", () => {
    const prompt = buildAgentFailureRetryPrompt({
      goal: "Send the report",
      outcome: "Gmail was not connected.",
      raw: "",
    });
    expect(prompt).toContain("Send the report");
    expect(prompt).toContain("Gmail was not connected.");
  });
});
