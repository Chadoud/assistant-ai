import { describe, expect, it } from "vitest";
import { filterAndSortOneDriveItems, oneDriveItemPassesFilters, type OneDriveFileItem } from "./oneDriveWorkspaceListFilter";
import { WORKSPACE_FILE_TYPE_CATEGORY_ORDER } from "./workspaceFileTypeCategories";

describe("oneDriveWorkspaceListFilter", () => {
  const base: OneDriveFileItem = {
    id: "1",
    name: "a.pdf",
    file: { mimeType: "application/pdf" },
    lastModifiedDateTime: "2024-01-15T12:00:00Z",
  };

  it("filters by pdf type using mime", () => {
    const xlsx: OneDriveFileItem = {
      id: "2",
      name: "b.xlsx",
      file: {
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      lastModifiedDateTime: "2024-01-15T12:00:00Z",
    };
    const rows = filterAndSortOneDriveItems([base, xlsx], ["pdf"], "any", "", "name");
    expect(rows.map((r) => r.id)).toEqual(["1"]);
  });

  it("falls back to extension when mime is missing", () => {
    const doc: OneDriveFileItem = {
      id: "3",
      name: "c.docx",
      lastModifiedDateTime: "2024-01-15T12:00:00Z",
    };
    expect(oneDriveItemPassesFilters(doc, ["documents"], "any", "")).toBe(true);
    expect(oneDriveItemPassesFilters(doc, ["pdf"], "any", "")).toBe(false);
  });

  it("respects modified date filter", () => {
    const recentIso = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const oldIso = new Date(Date.now() - 400 * 86_400_000).toISOString();
    const recent: OneDriveFileItem = {
      id: "4",
      name: "new.txt",
      file: { mimeType: "text/plain" },
      lastModifiedDateTime: recentIso,
    };
    const old: OneDriveFileItem = {
      id: "5",
      name: "old.txt",
      file: { mimeType: "text/plain" },
      lastModifiedDateTime: oldIso,
    };
    expect(oneDriveItemPassesFilters(old, WORKSPACE_FILE_TYPE_CATEGORY_ORDER, "30d", "")).toBe(false);
    expect(oneDriveItemPassesFilters(recent, WORKSPACE_FILE_TYPE_CATEGORY_ORDER, "30d", "")).toBe(true);
  });
});
