import { describe, expect, it } from "vitest";
import { UNCERTAIN_FOLDER } from "../constants";
import { NO_DESTINATION_FOLDER_KEY } from "./folderDestinationSummary";
import { groupDestinationByParent } from "./groupDestinationByParent";
import { OTHER_REASON_LABEL } from "./topNWithOther";

describe("groupDestinationByParent", () => {
  it("groups only flat folders as separate parents", () => {
    const rows = [
      { folder: "Invoices", count: 5 },
      { folder: "Tax", count: 2 },
    ];
    const g = groupDestinationByParent(rows);
    expect(g).toHaveLength(2);
    expect(g[0].parentKey).toBe("Invoices");
    expect(g[0].totalCount).toBe(5);
    expect(g[0].leaves).toEqual([
      expect.objectContaining({
        fullPath: "Invoices",
        count: 5,
        legendRowIndex: 0,
        leafLabel: "Invoices",
      }),
    ]);
    expect(g[1].parentKey).toBe("Tax");
    expect(g[1].totalCount).toBe(2);
  });

  it("sorts parents by total count with mixed flat and hierarchical rows", () => {
    const rows = [
      { folder: "Career/Job", count: 2 },
      { folder: "Invoices", count: 10 },
    ];
    const g = groupDestinationByParent(rows);
    expect(g.map((x) => x.parentKey)).toEqual(["Invoices", "Career"]);
  });

  it("merges hierarchical paths under one parent and sorts leaves by count", () => {
    const rows = [
      { folder: "Career/Job Applications", count: 3 },
      { folder: "Career/Employment", count: 10 },
    ];
    const g = groupDestinationByParent(rows);
    expect(g).toHaveLength(1);
    expect(g[0].parentKey).toBe("Career");
    expect(g[0].totalCount).toBe(13);
    expect(g[0].leaves.map((l) => l.leafLabel)).toEqual(["Employment", "Job Applications"]);
    expect(g[0].leaves[0].count).toBe(10);
    expect(g[0].leaves[1].count).toBe(3);
  });

  it("treats Uncertain, Other, and No destination as own parent rows without splitting", () => {
    const rows = [
      { folder: UNCERTAIN_FOLDER, count: 1 },
      { folder: OTHER_REASON_LABEL, count: 2 },
      { folder: NO_DESTINATION_FOLDER_KEY, count: 4 },
    ];
    const g = groupDestinationByParent(rows);
    expect(g).toHaveLength(3);
    const keys = g.map((x) => x.parentKey).sort();
    expect(keys).toEqual(
      [NO_DESTINATION_FOLDER_KEY, OTHER_REASON_LABEL, UNCERTAIN_FOLDER].sort()
    );
    for (const row of g) {
      expect(row.isSpecialBucket).toBe(true);
      expect(row.leaves).toHaveLength(1);
      expect(row.leaves[0].fullPath).toBe(row.parentKey);
    }
  });

  it("normalizes backslashes to slashes before splitting", () => {
    const rows = [{ folder: "A\\B\\C", count: 7 }];
    const g = groupDestinationByParent(rows);
    expect(g[0].parentKey).toBe("A");
    expect(g[0].leaves[0].leafLabel).toBe("B/C");
  });
});
