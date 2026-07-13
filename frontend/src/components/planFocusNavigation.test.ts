import { describe, expect, it } from "vitest";
import {
  clientToPlanLayoutPoint,
  computePlanFocusTransformWithScale,
  computeUniformPlanFocusScale,
  resolvePlanStepFromPointer,
  resolvePlanViewportTransform,
} from "./planFocusNavigation";
import type { PlanColumnBounds } from "./tesseractPlanLayout";

function col(_stepIndex: number, centerX: number, width = 40): PlanColumnBounds {
  const half = width / 2;
  return {
    minX: centerX - half,
    maxX: centerX + half,
    minY: -80,
    maxY: 120,
    centerX,
    centerY: 20,
    width,
    height: 200,
  };
}

describe("resolvePlanStepFromPointer", () => {
  const columns = [
    { stepIndex: 1, centerX: -120, bounds: col(1, -120) },
    { stepIndex: 2, centerX: -40, bounds: col(2, -40) },
    { stepIndex: 3, centerX: 40, bounds: col(3, 40) },
    { stepIndex: 4, centerX: 120, bounds: col(4, 120) },
  ];

  it("picks the column under the pointer without dead zones", () => {
    expect(resolvePlanStepFromPointer(-120, columns)).toBe(1);
    expect(resolvePlanStepFromPointer(-80, columns)).toBe(2);
    expect(resolvePlanStepFromPointer(0, columns)).toBe(3);
    expect(resolvePlanStepFromPointer(120, columns)).toBe(4);
  });
});

describe("computeUniformPlanFocusScale", () => {
  it("uses the tightest fit across all columns", () => {
    const small = col(1, 0, 60);
    const large = col(2, 80, 60);
    large.maxY = 260;
    large.height = 340;

    const scale = computeUniformPlanFocusScale([small, large], 480, 360, { maxScale: 2 });
    const smallFit = computeUniformPlanFocusScale([small], 480, 360, { maxScale: 2 });
    expect(scale).toBeLessThanOrEqual(smallFit);
  });
});

describe("computePlanFocusTransformWithScale", () => {
  it("pans using a shared scale", () => {
    const bounds = col(3, 50, 80);
    expect(computePlanFocusTransformWithScale(bounds, 1.5)).toEqual({
      scale: 1.5,
      translateX: -75,
      translateY: -30,
    });
  });
});

describe("clientToPlanLayoutPoint", () => {
  const rect = { left: 100, top: 50, width: 400, height: 300 } as DOMRect;

  it("inverts overview scale from screen to layout space", () => {
    const viewport = resolvePlanViewportTransform(true, null, 0.8, { translateX: 0, translateY: 0, scale: 1 });
    // layout x=100 → screen x = 100 * 0.8 = 80 from center → clientX = 100 + 200 + 80 = 380
    const layout = clientToPlanLayoutPoint(380, 200, rect, viewport);
    expect(layout.x).toBeCloseTo(100, 1);
  });

  it("inverts focus pan and zoom", () => {
    const focus = { translateX: -120, translateY: -40, scale: 1.6 };
    const viewport = resolvePlanViewportTransform(true, 2, 0.8, focus);
    const layoutX = 50;
    const cx = layoutX * viewport.scale + viewport.translateX;
    const clientX = rect.left + rect.width / 2 + cx;
    const layout = clientToPlanLayoutPoint(clientX, 200, rect, viewport);
    expect(layout.x).toBeCloseTo(layoutX, 5);
  });
});
