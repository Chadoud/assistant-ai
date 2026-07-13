import { describe, expect, it } from "vitest";
import { buildBrainGraph } from "./graphModel";
import { ForceLayout3D } from "./forceLayout3d";

function fileFolderGraph() {
  return buildBrainGraph({
    memories: [],
    conversations: [],
    tasks: [],
    fileFolders: [
      {
        folder_name: "JobApplications",
        profile: "",
        file_count: 2,
        keywords: [],
        updated_at: 1,
        files: [
          { name: "cv.pdf", path: "/tmp/cv.pdf", excerpt: "", updated_at: 1 },
          { name: "letter.pdf", path: "/tmp/letter.pdf", excerpt: "", updated_at: 2 },
        ],
      },
    ],
  });
}

describe("ForceLayout3D user-placed clusters", () => {
  it("keeps anchor and direct children fixed after commit", () => {
    const graph = fileFolderGraph();

    const layout = new ForceLayout3D(graph);
    layout.warmUp(40);

    const folderId = graph.nodes.find((n) => n.kind === "folder")!.id;
    const fileIds = graph.nodes.filter((n) => n.kind === "file").map((n) => n.id);
    expect(fileIds.length).toBe(2);

    const anchorIndex = layout.getNodeIndex(folderId)!;
    const anchor = layout.nodes[anchorIndex];
    const beforeX = anchor.x;

    const followers = fileIds.map((id) => {
      const idx = layout.getNodeIndex(id)!;
      const child = layout.nodes[idx];
      return {
        index: idx,
        dx: child.x - anchor.x,
        dy: child.y - anchor.y,
        dz: child.z - anchor.z,
      };
    });

    anchor.x = beforeX + 120;
    anchor.y += 40;
    layout.commitUserPlacedCluster(anchorIndex, followers);

    for (let step = 0; step < 80; step++) layout.step();

    expect(layout.nodes[anchorIndex].x).toBeCloseTo(beforeX + 120, 0);
    expect(layout.nodes[anchorIndex].userPlaced).toBe(true);
    for (const follower of followers) {
      const child = layout.nodes[follower.index];
      expect(child.x).toBeCloseTo(anchor.x + follower.dx, 0);
      expect(child.followAnchorIndex).toBe(anchorIndex);
    }
  });

  it("attachUnsetDirectChildren links all descendants to a placed files hub", () => {
    const graph = fileFolderGraph();
    const layout = new ForceLayout3D(graph);
    layout.warmUp(40);

    const hubId = graph.nodes.find((n) => n.id === "hub:files")!.id;
    const anchorIndex = layout.getNodeIndex(hubId)!;
    const anchor = layout.nodes[anchorIndex];
    layout.commitUserPlacedCluster(anchorIndex, []);

    const childrenById = new Map<string, string[]>();
    for (const link of graph.links) {
      const list = childrenById.get(link.source) ?? [];
      list.push(link.target);
      childrenById.set(link.source, list);
    }
    layout.attachUnsetDirectChildren(childrenById);

    const folderId = graph.nodes.find((n) => n.kind === "folder")!.id;
    const folderIndex = layout.getNodeIndex(folderId)!;
    expect(layout.nodes[folderIndex].followAnchorIndex).toBe(anchorIndex);

    for (const file of graph.nodes.filter((n) => n.kind === "file")) {
      const idx = layout.getNodeIndex(file.id)!;
      expect(layout.nodes[idx].followAnchorIndex).toBe(anchorIndex);
      expect(layout.nodes[idx].x).toBeCloseTo(anchor.x + layout.nodes[idx].offsetFromAnchor!.dx, 0);
    }
  });
});
