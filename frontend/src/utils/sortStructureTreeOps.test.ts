import { describe, expect, it } from "vitest";
import { moduleToChain, updateModuleById } from "./sortStructureTreeOps";
import type { SortStructureModule } from "../types/sortStructure";

const child: SortStructureModule = {
  id: "c",
  theme: "project",
  maxFolders: null,
  overflowPolicy: "merge_into_other",
  children: [],
};

const root: SortStructureModule = {
  id: "r",
  theme: "organization",
  maxFolders: null,
  overflowPolicy: "merge_into_other",
  children: [child],
};

describe("moduleToChain", () => {
  it("flattens a linear branch", () => {
    expect(moduleToChain(root).map((m) => m.id)).toEqual(["r", "c"]);
  });
});

describe("updateModuleById", () => {
  it("updates nested module", () => {
    const next = updateModuleById([root], "c", { ...child, theme: "year" });
    expect(next[0].children[0].theme).toBe("year");
  });
});
