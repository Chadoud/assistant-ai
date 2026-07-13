import { describe, expect, it } from "vitest";
import {
  assistantSpokeCodegenStudioIntent,
  resolveVoiceCodegenFallbackGoal,
  shouldLaunchVoiceCodegenFallback,
} from "./voiceCodegenFallback";

describe("shouldLaunchVoiceCodegenFallback", () => {
  it("launches when user asked to build an app and no tool ran", () => {
    expect(
      shouldLaunchVoiceCodegenFallback(
        "Create a cool app for our demo",
        "Opening that in Codegen Studio now.",
        { toolName: null, toolSource: null, briefingSection: null },
      ),
    ).toBe(true);
  });

  it("launches everyday phrasing even with speech typo cool up", () => {
    expect(
      shouldLaunchVoiceCodegenFallback(
        "Hey, can you build a cool up for our demo?",
        "Opening that in Codegen Studio now.",
        { toolName: null, toolSource: null, briefingSection: null },
      ),
    ).toBe(true);
    expect(
      resolveVoiceCodegenFallbackGoal(
        "Hey, can you build a cool up for our demo?",
        "Opening that in Codegen Studio now.",
        [],
      ),
    ).toBe("Hey, can you build a cool up for our demo?");
  });

  it("still launches when a soft tool like save_memory also ran", () => {
    expect(
      shouldLaunchVoiceCodegenFallback(
        "Build a cool app for our demo",
        "Opening that in Codegen Studio now.",
        { toolName: "save_memory", toolSource: "save_memory", briefingSection: null },
      ),
    ).toBe(true);
  });

  it("skips when start_codegen_studio already ran", () => {
    expect(
      shouldLaunchVoiceCodegenFallback(
        "Build a todo app",
        "Opening that in Codegen Studio now.",
        { toolName: "start_codegen_studio", toolSource: "start_codegen_studio", briefingSection: null },
      ),
    ).toBe(false);
  });

  it("skips when another build tool handled the turn", () => {
    expect(
      shouldLaunchVoiceCodegenFallback(
        "Build a todo app",
        "Let me work through that.",
        { toolName: "plan_and_execute", toolSource: "plan_and_execute", briefingSection: null },
      ),
    ).toBe(false);
  });

  it("launches from assistant spoken intent when user text is short follow-up", () => {
    expect(
      shouldLaunchVoiceCodegenFallback(
        "yes do it",
        "Opening that in Codegen Studio now.",
        { toolName: null, toolSource: null, briefingSection: null },
        ["Create a cool app for our demo"],
      ),
    ).toBe(true);
    expect(
      resolveVoiceCodegenFallbackGoal(
        "yes do it",
        "Opening that in Codegen Studio now.",
        ["Create a cool app for our demo"],
      ),
    ).toBe("Create a cool app for our demo");
  });

  it("does not launch short follow-up without a prior build request", () => {
    expect(
      shouldLaunchVoiceCodegenFallback(
        "yes do it",
        "Opening that in Codegen Studio now.",
        { toolName: null, toolSource: null, briefingSection: null },
        [],
      ),
    ).toBe(false);
  });
});

describe("assistantSpokeCodegenStudioIntent", () => {
  it("detects the scripted codegen acknowledgment", () => {
    expect(assistantSpokeCodegenStudioIntent("Opening that in Codegen Studio now.")).toBe(true);
  });
});
