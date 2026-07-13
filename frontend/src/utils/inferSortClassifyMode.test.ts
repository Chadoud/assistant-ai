import { describe, expect, it } from "vitest";
import { inferSortClassifyModeFromLegacy } from "./inferSortClassifyMode";
import { DEFAULT_SORT_STRUCTURE_TEMPLATE } from "../types/sortStructure";

describe("inferSortClassifyModeFromLegacy", () => {
  it("prefers structure when template enabled", () => {
    expect(
      inferSortClassifyModeFromLegacy("prompt", {
        ...DEFAULT_SORT_STRUCTURE_TEMPLATE,
        enabled: true,
        modules: [
          {
            id: "a",
            theme: "year",
            children: [],
            maxFolders: null,
            customLabel: "",
            overflowPolicy: "send_to_uncertain",
          },
        ],
      })
    ).toBe("structure");
  });

  it("uses custom when only prompt is set", () => {
    expect(inferSortClassifyModeFromLegacy("hello", DEFAULT_SORT_STRUCTURE_TEMPLATE)).toBe("custom");
  });

  it("defaults to builtin", () => {
    expect(inferSortClassifyModeFromLegacy("", DEFAULT_SORT_STRUCTURE_TEMPLATE)).toBe("builtin");
  });
});
