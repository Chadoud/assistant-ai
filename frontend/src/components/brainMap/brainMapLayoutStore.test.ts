import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRAIN_MAP_LAYOUT_STORAGE_KEY,
  clearBrainMapLayout,
  pruneBrainMapLayout,
  readBrainMapLayout,
  saveBrainMapAnchorPlacement,
} from "./brainMapLayoutStore";

describe("brainMapLayoutStore", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
    });
  });

  it("round-trips anchor placement with child offsets", () => {
    saveBrainMapAnchorPlacement("folder:job", {
      x: 10,
      y: 20,
      z: 30,
      childOffsets: {
        "file:abc": { dx: 1, dy: 2, dz: 3 },
      },
    });
    expect(readBrainMapLayout()["folder:job"]).toEqual({
      x: 10,
      y: 20,
      z: 30,
      childOffsets: { "file:abc": { dx: 1, dy: 2, dz: 3 } },
    });
  });

  it("clearBrainMapLayout removes saved data", () => {
    saveBrainMapAnchorPlacement("folder:job", { x: 0, y: 0, z: 0, childOffsets: {} });
    clearBrainMapLayout();
    expect(storage.has(BRAIN_MAP_LAYOUT_STORAGE_KEY)).toBe(false);
    expect(readBrainMapLayout()).toEqual({});
  });

  it("pruneBrainMapLayout drops stale child offset ids", () => {
    saveBrainMapAnchorPlacement("folder:job", {
      x: 1,
      y: 2,
      z: 3,
      childOffsets: {
        "file:gone": { dx: 1, dy: 0, dz: 0 },
        "file:keep": { dx: 2, dy: 0, dz: 0 },
      },
    });
    pruneBrainMapLayout(new Set(["folder:job"]), new Set(["folder:job", "file:keep"]));
    expect(readBrainMapLayout()["folder:job"]?.childOffsets).toEqual({
      "file:keep": { dx: 2, dy: 0, dz: 0 },
    });
  });
});
