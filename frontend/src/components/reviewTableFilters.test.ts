import { describe, expect, it } from "vitest";
import type { FileEntry } from "../api";
import { CONFIDENCE_HIGH, CONFIDENCE_LOW } from "../constants";
import { filterReviewRows } from "./reviewTableFilters";

function row(partial: Partial<FileEntry> & Pick<FileEntry, "path" | "name">): FileEntry {
  return {
    path: partial.path,
    name: partial.name,
    confidence: partial.confidence,
    approved: partial.approved,
    suggested_folder: partial.suggested_folder,
    final_folder: partial.final_folder,
  } as FileEntry;
}

describe("filterReviewRows", () => {
  const rows = [
    row({ path: "/a.pdf", name: "invoice-acme.pdf", confidence: 0.95, approved: true }),
    row({ path: "/b.pdf", name: "scan-notes.pdf", confidence: 0.65, approved: false }),
    row({ path: "/c.pdf", name: "receipt.pdf", confidence: 0.2, approved: false }),
  ];

  it("returns all rows when filters are default", () => {
    expect(
      filterReviewRows(rows, { confidence: "all", approval: "all", searchQuery: "" }),
    ).toHaveLength(3);
  });

  it("filters by confidence band", () => {
    const high = filterReviewRows(rows, { confidence: "high", approval: "all", searchQuery: "" });
    expect(high.map((r) => r.name)).toEqual(["invoice-acme.pdf"]);
    expect((high[0].confidence ?? 0) >= CONFIDENCE_HIGH).toBe(true);

    const medium = filterReviewRows(rows, { confidence: "medium", approval: "all", searchQuery: "" });
    expect(medium.map((r) => r.name)).toEqual(["scan-notes.pdf"]);

    const low = filterReviewRows(rows, { confidence: "low", approval: "all", searchQuery: "" });
    expect(low.map((r) => r.name)).toEqual(["receipt.pdf"]);
    expect((low[0].confidence ?? 1) < CONFIDENCE_LOW).toBe(true);
  });

  it("filters by approval state and search query", () => {
    const needsReview = filterReviewRows(rows, {
      confidence: "all",
      approval: "needsReview",
      searchQuery: "",
    });
    expect(needsReview).toHaveLength(2);

    const search = filterReviewRows(rows, {
      confidence: "all",
      approval: "all",
      searchQuery: "receipt",
    });
    expect(search.map((r) => r.name)).toEqual(["receipt.pdf"]);
  });
});
