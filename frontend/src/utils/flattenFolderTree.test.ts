import { describe, expect, it } from "vitest";
import { flattenFolderRelPaths } from "./flattenFolderTree";
import type { FolderNode } from "../api";

describe("flattenFolderRelPaths", () => {
  it("flattens nested nodes to relative paths", () => {
    const tree: FolderNode[] = [
      {
        name: "Career",
        path: "/out/Career",
        files: [],
        children: [
          { name: "Job Applications", path: "/out/Career/Job Applications", files: ["a.pdf"], children: [] },
        ],
      },
    ];
    const flat = flattenFolderRelPaths(tree);
    expect(flat.map((x) => x.value)).toEqual(["Career", "Career/Job Applications"]);
    expect(flat.find((x) => x.value === "Career/Job Applications")?.fileCount).toBe(1);
  });
});
