import { describe, expect, it } from "vitest";
import { firstInstalledVisionModel, isVisionCapableModelName } from "./visionModels";

describe("visionModels", () => {
  it("detects vision-capable names by keyword", () => {
    expect(isVisionCapableModelName("llava:13b")).toBe(true);
    expect(isVisionCapableModelName("mistral:latest")).toBe(false);
  });

  it("returns first vision-capable model in list order", () => {
    expect(firstInstalledVisionModel(["mistral:latest", "llava:7b", "moondream:latest"])).toBe("llava:7b");
    expect(firstInstalledVisionModel(["mistral:latest"])).toBe(null);
  });
});
