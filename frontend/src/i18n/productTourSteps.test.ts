import { describe, expect, it } from "vitest";
import { buildProductTourStepMeta } from "./productTourSteps";

describe("buildProductTourStepMeta", () => {
  it("includes core sort path steps for cloud users", () => {
    const steps = buildProductTourStepMeta(true);
    expect(steps.map((s) => s.id)).toEqual([
      "intro",
      "sort-flow-strip",
      "sort-tab",
      "workspace-local",
      "external-sources",
      "run-sort",
      "results-tab",
      "assistant-chat",
      "sources-tab",
      "settings-output-folder",
      "help-shortcuts",
    ]);
  });

  it("appends local model steps when cloud sort is off", () => {
    const steps = buildProductTourStepMeta(false);
    expect(steps).toHaveLength(13);
    expect(steps.slice(-2).map((s) => s.id)).toEqual(["settings-models-overview", "settings-system"]);
  });
});
