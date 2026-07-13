import { describe, it, expect } from "vitest";
import { assertSafeTrackProps, assertSafeTrackPropsOrThrow } from "./redact";

describe("assertSafeTrackProps", () => {
  it("allows allowlisted-style keys", () => {
    expect(assertSafeTrackProps({ step: 1, tab: "queue" })).toBe(true);
  });

  it("rejects path-like keys", () => {
    expect(assertSafeTrackProps({ filepath: "x" })).toBe(false);
    expect(assertSafeTrackProps({ path_hint: "x" })).toBe(false);
  });
});

describe("assertSafeTrackPropsOrThrow", () => {
  it("throws on unsafe keys", () => {
    expect(() => assertSafeTrackPropsOrThrow({ folder: "x" })).toThrow();
  });
});
