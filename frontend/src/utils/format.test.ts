import { describe, expect, it } from "vitest";
import { formatAnalyzeDurationMs } from "./format";

describe("formatAnalyzeDurationMs", () => {
  it("returns null for invalid input", () => {
    expect(formatAnalyzeDurationMs(null)).toBe(null);
    expect(formatAnalyzeDurationMs(undefined)).toBe(null);
    expect(formatAnalyzeDurationMs(-1)).toBe(null);
    expect(formatAnalyzeDurationMs(Number.NaN)).toBe(null);
  });

  it("uses milliseconds under one second", () => {
    expect(formatAnalyzeDurationMs(0)).toBe("0 ms");
    expect(formatAnalyzeDurationMs(500)).toBe("500 ms");
    expect(formatAnalyzeDurationMs(999)).toBe("999 ms");
  });

  it("uses whole seconds under one minute", () => {
    expect(formatAnalyzeDurationMs(1000)).toBe("1 s");
    expect(formatAnalyzeDurationMs(45_000)).toBe("45 s");
    expect(formatAnalyzeDurationMs(59_499)).toBe("59 s");
  });

  it("uses minutes and seconds from one minute upward", () => {
    expect(formatAnalyzeDurationMs(60_000)).toBe("1m 00s");
    expect(formatAnalyzeDurationMs(214_000)).toBe("3m 34s");
    expect(formatAnalyzeDurationMs(59 * 60_000 + 59_000)).toBe("59m 59s");
  });

  it("includes hours for very long durations", () => {
    expect(formatAnalyzeDurationMs(3600_000)).toBe("1h 00m 00s");
    expect(formatAnalyzeDurationMs(3661_000)).toBe("1h 01m 01s");
  });
});
