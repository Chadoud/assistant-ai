import { describe, expect, it } from "vitest";
import { pipelineProgressFillStyle } from "./pipelineProgressUtils";

describe("pipelineProgressFillStyle", () => {
  it("clamps percent to 0–100 and uses scaleX", () => {
    expect(pipelineProgressFillStyle(-5)).toEqual({ transform: "scaleX(0)" });
    expect(pipelineProgressFillStyle(50)).toEqual({ transform: "scaleX(0.5)" });
    expect(pipelineProgressFillStyle(200)).toEqual({ transform: "scaleX(1)" });
  });
});
