import { describe, expect, it } from "vitest";
import { DOUBLE_CLAP_COOLDOWN_MS, DOUBLE_CLAP_MIN_MS_DOUBLE } from "./doubleClapEngine";
import { feedDoubleClapFrames } from "./clapFeedFrames";

const QUIET_RMS = 0.022;
/** Above threshold and ~3.2× a typical quiet `prevRms` after smoothing. */
const SPIKE_RMS = 0.12;

describe("doubleClapEngine", () => {
  it("detects two transients spaced in the double-clap window", () => {
    const { doubleClapCount, states } = feedDoubleClapFrames([
      { durationMs: 100, rms: QUIET_RMS },
      { durationMs: 1, rms: SPIKE_RMS },
      { durationMs: 350, rms: QUIET_RMS },
      { durationMs: 1, rms: SPIKE_RMS },
      { durationMs: 50, rms: QUIET_RMS },
    ]);

    expect(doubleClapCount).toBe(1);
    expect(states.filter(Boolean).length).toBe(1);
  });

  it("does not fire on a single transient", () => {
    const { doubleClapCount } = feedDoubleClapFrames([
      { durationMs: 120, rms: QUIET_RMS },
      { durationMs: 1, rms: SPIKE_RMS },
      { durationMs: 200, rms: QUIET_RMS },
    ]);
    expect(doubleClapCount).toBe(0);
  });

  it("does not fire when second peak is too soon (echo)", () => {
    const { doubleClapCount } = feedDoubleClapFrames([
      { durationMs: 100, rms: QUIET_RMS },
      { durationMs: 1, rms: SPIKE_RMS },
      { durationMs: 50, rms: QUIET_RMS },
      { durationMs: 1, rms: SPIKE_RMS },
      { durationMs: 50, rms: QUIET_RMS },
    ]);
    expect(doubleClapCount).toBe(0);
  });

  it("does not fire when second peak is after the max double-clap gap", () => {
    const { doubleClapCount } = feedDoubleClapFrames([
      { durationMs: 100, rms: QUIET_RMS },
      { durationMs: 1, rms: SPIKE_RMS },
      { durationMs: 1000, rms: QUIET_RMS },
      { durationMs: 1, rms: SPIKE_RMS },
      { durationMs: 50, rms: QUIET_RMS },
    ]);
    expect(doubleClapCount).toBe(0);
  });

  it("does not fire a second double within cooldown", () => {
    const gapMs = 400;
    const betweenDoublesMs = DOUBLE_CLAP_COOLDOWN_MS - 500;
    expect(betweenDoublesMs).toBeLessThan(DOUBLE_CLAP_COOLDOWN_MS);
    expect(gapMs).toBeGreaterThanOrEqual(DOUBLE_CLAP_MIN_MS_DOUBLE);

    const { doubleClapCount } = feedDoubleClapFrames([
      { durationMs: 100, rms: QUIET_RMS },
      { durationMs: 1, rms: SPIKE_RMS },
      { durationMs: gapMs - 1, rms: QUIET_RMS },
      { durationMs: 1, rms: SPIKE_RMS },
      { durationMs: betweenDoublesMs, rms: QUIET_RMS },
      { durationMs: 1, rms: SPIKE_RMS },
      { durationMs: gapMs - 1, rms: QUIET_RMS },
      { durationMs: 1, rms: SPIKE_RMS },
      { durationMs: 50, rms: QUIET_RMS },
    ]);

    expect(doubleClapCount).toBe(1);
  });
});
