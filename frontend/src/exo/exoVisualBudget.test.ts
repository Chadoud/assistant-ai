import { describe, expect, it } from "vitest";
import {
  resolveExoVisualBudget,
  shouldSuspendVoiceAnalyser,
  voiceStatusNeedsMotion,
} from "./exoVisualBudget";

describe("exoVisualBudget", () => {
  it("voiceStatusNeedsMotion covers live session statuses only", () => {
    expect(voiceStatusNeedsMotion("IDLE")).toBe(false);
    expect(voiceStatusNeedsMotion("LISTENING")).toBe(true);
    expect(voiceStatusNeedsMotion("SPEAKING")).toBe(true);
    expect(voiceStatusNeedsMotion("ACTIVE")).toBe(true);
    expect(voiceStatusNeedsMotion("RECONNECTING")).toBe(true);
  });

  it("keeps tesseract RUNNING whenever visible and focused", () => {
    expect(resolveExoVisualBudget({ hidden: false })).toBe("RUNNING");
  });

  it("freezes tesseract only when hidden (bg / off-tab / blurred)", () => {
    expect(resolveExoVisualBudget({ hidden: true })).toBe("HIDDEN_SUSPENDED");
  });

  it("suspends analyser when idle even if tesseract is visible", () => {
    expect(shouldSuspendVoiceAnalyser({ hidden: false, voiceStatus: "IDLE" })).toBe(true);
    expect(shouldSuspendVoiceAnalyser({ hidden: false, voiceStatus: "LISTENING" })).toBe(false);
    expect(shouldSuspendVoiceAnalyser({ hidden: true, voiceStatus: "LISTENING" })).toBe(true);
  });
});
