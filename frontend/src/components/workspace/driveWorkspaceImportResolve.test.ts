import { describe, expect, it, vi } from "vitest";
import {
  listAllFileRowsDescendantOf,
  resolveDriveFileIdsForMerge,
} from "./driveWorkspaceImportResolve";
import { DRIVE_FOLDER_MIME } from "./driveWorkspaceListFilter";
import type { DriveMergePrefs } from "./DriveWorkspaceSortBlock";
import { defaultWorkspaceFileTypeCategories } from "./workspaceFileTypeCategories";

const baseMerge = (): DriveMergePrefs => ({
  enabled: true,
  parentId: "root",
  typeCategories: defaultWorkspaceFileTypeCategories(),
  dateFilter: "any",
  sinceDate: "",
  sortOption: "name",
});

describe("listAllFileRowsDescendantOf", () => {
  it("BFS: lists root then enqueued subfolders", async () => {
    const listFn = vi.fn().mockImplementation((p: { parentId?: string }) => {
      if (p?.parentId === "root") {
        return { ok: true, files: [
          { id: "sub1", name: "Sub", mimeType: DRIVE_FOLDER_MIME },
          { id: "r1", name: "a.txt", mimeType: "text/plain" },
        ] as const, nextPageToken: undefined as string | undefined };
      }
      if (p?.parentId === "sub1") {
        return { ok: true, files: [
          { id: "d1", name: "b.txt", mimeType: "text/plain" },
        ] as const, nextPageToken: undefined as string | undefined };
      }
      return { ok: true, files: [] as const, nextPageToken: undefined as string | undefined };
    });
    const rows = await listAllFileRowsDescendantOf(listFn, "root");
    expect(listFn).toHaveBeenCalledWith({ parentId: "root", pageSize: 100, pageToken: undefined });
    expect(listFn).toHaveBeenCalledWith({ parentId: "sub1", pageSize: 100, pageToken: undefined });
    const ids = new Set(rows.map((r) => r.id));
    expect(ids).toEqual(new Set(["r1", "d1"]));
  });
});

describe("resolveDriveFileIdsForMerge", () => {
  it("excludes Google folder rows, sorts by name, cap", async () => {
    const files = Array.from({ length: 10 }, (_, i) => ({
      id: `f-${i}`,
      name: `file${String(i).padStart(2, "0")}.txt`,
      mimeType: "text/plain",
    }));
    const listFn = vi.fn().mockResolvedValue({ ok: true, files, nextPageToken: undefined as string | undefined });
    const got = await resolveDriveFileIdsForMerge(baseMerge(), listFn);
    expect(listFn).toHaveBeenCalledWith({ flatMyDriveFiles: true, pageSize: 100, pageToken: undefined });
    expect(got).toEqual(files.map((f) => f.id));
  });

  it("follows nextPageToken until exhausted", async () => {
    const listFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        files: [{ id: "a1", name: "a1.pdf", mimeType: "application/pdf" }],
        nextPageToken: "n1",
      })
      .mockResolvedValueOnce({
        ok: true,
        files: [{ id: "a2", name: "a2.pdf", mimeType: "application/pdf" }],
        nextPageToken: undefined,
      });
    const got = await resolveDriveFileIdsForMerge(baseMerge(), listFn);
    expect(listFn).toHaveBeenCalledTimes(2);
    expect(listFn).toHaveBeenNthCalledWith(1, { flatMyDriveFiles: true, pageSize: 100, pageToken: undefined });
    expect(listFn).toHaveBeenNthCalledWith(2, { flatMyDriveFiles: true, pageSize: 100, pageToken: "n1" });
    expect(got).toEqual(["a1", "a2"]);
  });

  it("returns empty on list failure", async () => {
    const listFn = vi.fn().mockResolvedValue({ ok: false, reason: "nope" });
    const got = await resolveDriveFileIdsForMerge(baseMerge(), listFn);
    expect(got).toEqual([]);
  });

  it("uses BFS listing when parentId is not root", async () => {
    const listFn = vi.fn().mockImplementation((p: { parentId?: string }) => {
      if (p?.parentId === "folderABC") {
        return {
          ok: true,
          files: [{ id: "x1", name: "only.txt", mimeType: "text/plain" }] as const,
          nextPageToken: undefined as string | undefined,
        };
      }
      return { ok: true, files: [] as const, nextPageToken: undefined as string | undefined };
    });
    const merge = { ...baseMerge(), parentId: "folderABC" };
    const got = await resolveDriveFileIdsForMerge(merge, listFn);
    expect(listFn).toHaveBeenCalledWith({ parentId: "folderABC", pageSize: 100, pageToken: undefined });
    expect(listFn.mock.calls.every((c) => !c[0]?.flatMyDriveFiles)).toBe(true);
    expect(got).toEqual(["x1"]);
  });

  it("treats whitespace-only parentId as root and uses flat listing", async () => {
    const listFn = vi.fn().mockResolvedValue({ ok: true, files: [], nextPageToken: undefined as string | undefined });
    await resolveDriveFileIdsForMerge({ ...baseMerge(), parentId: "   " }, listFn);
    expect(listFn).toHaveBeenCalledWith({ flatMyDriveFiles: true, pageSize: 100, pageToken: undefined });
  });

  it("returns all filtered file ids with no product cap", async () => {
    const files = Array.from({ length: 150 }, (_, i) => ({
      id: `f-${i}`,
      name: `f${i}.txt`,
      mimeType: "text/plain",
    }));
    const listFn = vi.fn().mockResolvedValue({ ok: true, files, nextPageToken: undefined as string | undefined });
    const got = await resolveDriveFileIdsForMerge(baseMerge(), listFn);
    expect(got).toHaveLength(150);
  });

  it("returns empty when AbortSignal is already aborted", async () => {
    const listFn = vi.fn();
    const ac = new AbortController();
    ac.abort();
    const got = await resolveDriveFileIdsForMerge(baseMerge(), listFn, { signal: ac.signal });
    expect(got).toEqual([]);
    expect(listFn).not.toHaveBeenCalled();
  });
});
