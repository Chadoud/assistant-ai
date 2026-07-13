import { describe, expect, it } from "vitest";
import {
  DRIVE_FOLDER_MIME,
  filterAndSortDriveRows,
  localDayStartMs,
  rowPassesFilters,
} from "./driveWorkspaceListFilter";
import { WORKSPACE_FILE_TYPE_CATEGORY_ORDER } from "./workspaceFileTypeCategories";

const folder = (name: string, id = "f1") => ({
  id,
  name,
  mimeType: DRIVE_FOLDER_MIME,
  modifiedTime: "2020-01-01T00:00:00.000Z",
});

const file = (name: string, mime: string, modified: string, id = "a") => ({
  id,
  name,
  mimeType: mime,
  modifiedTime: modified,
});

describe("driveWorkspaceListFilter", () => {
  it("keeps folders when type filter excludes a file", () => {
    const items = [folder("Docs"), file("a.pdf", "application/pdf", "2025-12-01T00:00:00.000Z")];
    const r = filterAndSortDriveRows(items, ["spreadsheets"], "any", "", "name");
    expect(r.map((x) => x.id)).toEqual([folder("Docs").id]);
  });

  it("filters files by 7d window", () => {
    const now = Date.now();
    const recent = file("new.pdf", "application/pdf", new Date(now - 86400_000).toISOString(), "n");
    const old = file("old.pdf", "application/pdf", new Date(now - 20 * 86400_000).toISOString(), "o");
    const r = filterAndSortDriveRows([old, recent], WORKSPACE_FILE_TYPE_CATEGORY_ORDER, "7d", "", "name");
    expect(r.map((x) => x.id)).toEqual(["n"]);
  });

  it("applies since date from local day start (consistent with minMs)", () => {
    const since = "2025-01-15";
    const start = localDayStartMs(since);
    expect(start).not.toBeNull();
    const tAfter = new Date((start as number) + 3600_000).toISOString();
    const tBefore = new Date((start as number) - 1).toISOString();
    expect(
      rowPassesFilters({ id: "1", name: "a", mimeType: "application/pdf", modifiedTime: tAfter }, WORKSPACE_FILE_TYPE_CATEGORY_ORDER, "since", since)
    ).toBe(true);
    expect(
      rowPassesFilters({ id: "2", name: "b", mimeType: "application/pdf", modifiedTime: tBefore }, WORKSPACE_FILE_TYPE_CATEGORY_ORDER, "since", since)
    ).toBe(false);
  });
});
