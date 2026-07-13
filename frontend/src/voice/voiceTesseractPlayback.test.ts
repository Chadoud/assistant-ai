import { describe, expect, it } from "vitest";
import { stepSmoothedPlaybackRate, voicePlaybackTarget } from "./voiceTesseractPlayback";

describe("voiceTesseractPlayback", () => {
  it("raises LISTENING target with amplitude", () => {
    const quiet = voicePlaybackTarget("LISTENING", 0, "");
    const loud = voicePlaybackTarget("LISTENING", 0.5, "");
    expect(loud).toBeGreaterThan(quiet);
  });

  it("smooths toward blended landing rate", () => {
    const next = stepSmoothedPlaybackRate(1.3, "IDLE", 0, "", 0.5, 1.3);
    expect(next).toBeLessThan(1.3);
    expect(next).toBeGreaterThan(0.05);
  });
});
