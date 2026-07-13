import { describe, expect, it } from "vitest";
import { computeStartupDisplayPercent } from "./backendStartupProgress";

describe("computeStartupDisplayPercent", () => {
  it("returns 0 without a sample", () => {
    expect(computeStartupDisplayPercent(null, 0, 10_000)).toBe(0);
  });

  it("extrapolates elapsed time between polls", () => {
    const sample = { elapsedMs: 60_000, maxWaitMs: 240_000, percent: 25 };
    expect(computeStartupDisplayPercent(sample, 0, 30_000)).toBe(38);
  });

  it("caps at 99 until health is ready", () => {
    const sample = { elapsedMs: 230_000, maxWaitMs: 240_000, percent: 99 };
    expect(computeStartupDisplayPercent(sample, 0, 120_000)).toBe(99);
  });

  it("returns 100 when the sample reports ready", () => {
    const sample = { elapsedMs: 240_000, maxWaitMs: 240_000, percent: 100 };
    expect(computeStartupDisplayPercent(sample, 0, 999_999)).toBe(100);
  });
});
