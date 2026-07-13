import { describe, expect, it } from "vitest";
import { computeHoverCardPosition } from "./brainMapHoverPosition";

describe("computeHoverCardPosition", () => {
  it("keeps the card inside the container", () => {
    const pos = computeHoverCardPosition(200, 150, 180, 120, 400, 300);
    expect(pos.left).toBeGreaterThanOrEqual(10);
    expect(pos.top).toBeGreaterThanOrEqual(10);
    expect(pos.left + 180).toBeLessThanOrEqual(390);
    expect(pos.top + 120).toBeLessThanOrEqual(290);
  });

  it("flips left when near the right edge", () => {
    const pos = computeHoverCardPosition(360, 150, 180, 120, 400, 300);
    expect(pos.left).toBeLessThan(360);
  });

  it("nudges the card away from a reserved inspector strip", () => {
    const pos = computeHoverCardPosition(360, 150, 180, 120, 400, 300, 280);
    expect(pos.left).toBeLessThan(360);
    expect(pos.left).toBeGreaterThanOrEqual(10);
  });
});
