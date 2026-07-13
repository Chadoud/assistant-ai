import { describe, expect, it } from "vitest";
import { donutAnnulusSectorPath } from "./donutUncertainHatchPath";

describe("donutAnnulusSectorPath", () => {
  it("returns a closed annulus path for a quarter turn", () => {
    const d = donutAnnulusSectorPath(0, 90);
    expect(d).toMatch(/^M /);
    expect(d).toMatch(/ Z$/);
    expect(d.split("A").length).toBe(3);
  });
});
