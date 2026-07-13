import { describe, expect, it } from "vitest";
import { getAnalysisModelGap } from "./analysisModelReadiness";

describe("getAnalysisModelGap", () => {
  it("requires local sort and vision installs in local mode", () => {
    expect(
      getAnalysisModelGap({ model: "mistral", visionModel: "auto" }, ["llava:7b"])
    ).toEqual({ missingSortModel: true, missingVisionModel: false });

    expect(
      getAnalysisModelGap({ model: "mistral", visionModel: "auto" }, ["mistral", "llava:7b"])
    ).toEqual({ missingSortModel: false, missingVisionModel: false });
  });

  it("uses gateway/default sort model when remoteSortLlm and settings empty", () => {
    expect(
      getAnalysisModelGap({ model: "", visionModel: "auto" }, [], { remoteSortLlm: true })
    ).toEqual({ missingSortModel: false, missingVisionModel: false });

    expect(
      getAnalysisModelGap({ model: "", visionModel: "auto" }, ["mistral:latest"], { remoteSortLlm: true })
    ).toEqual({ missingSortModel: false, missingVisionModel: false });
  });
});
