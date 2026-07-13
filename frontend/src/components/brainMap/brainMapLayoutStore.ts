/** Persisted anchor positions for the 3D brain map (folders + category hubs). */
export const BRAIN_MAP_LAYOUT_STORAGE_KEY = "exosites.brainMap.layout.v1";

export type BrainMapChildOffset = { dx: number; dy: number; dz: number };

export type BrainMapAnchorPlacement = {
  x: number;
  y: number;
  z: number;
  childOffsets: Record<string, BrainMapChildOffset>;
};

export type BrainMapLayoutStore = Record<string, BrainMapAnchorPlacement>;

function parseStore(raw: string | null): BrainMapLayoutStore {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: BrainMapLayoutStore = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      if (typeof row.x !== "number" || typeof row.y !== "number" || typeof row.z !== "number") continue;
      const childOffsets: Record<string, BrainMapChildOffset> = {};
      if (row.childOffsets && typeof row.childOffsets === "object") {
        for (const [childId, offset] of Object.entries(row.childOffsets as Record<string, unknown>)) {
          if (!offset || typeof offset !== "object") continue;
          const o = offset as Record<string, unknown>;
          if (typeof o.dx !== "number" || typeof o.dy !== "number" || typeof o.dz !== "number") continue;
          childOffsets[childId] = { dx: o.dx, dy: o.dy, dz: o.dz };
        }
      }
      out[id] = { x: row.x, y: row.y, z: row.z, childOffsets };
    }
    return out;
  } catch {
    return {};
  }
}

function canUseStorage(): boolean {
  return typeof localStorage !== "undefined";
}

/** Read saved anchor placements from localStorage. */
export function readBrainMapLayout(): BrainMapLayoutStore {
  if (!canUseStorage()) return {};
  try {
    return parseStore(localStorage.getItem(BRAIN_MAP_LAYOUT_STORAGE_KEY));
  } catch {
    return {};
  }
}

/** Persist one anchor cluster (anchor position + direct-child offsets). */
export function saveBrainMapAnchorPlacement(anchorId: string, placement: BrainMapAnchorPlacement): void {
  if (!canUseStorage()) return;
  try {
    const store = readBrainMapLayout();
    store[anchorId] = placement;
    localStorage.setItem(BRAIN_MAP_LAYOUT_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Drop stale anchors and child ids after a graph refresh. */
export function pruneBrainMapLayout(validAnchorIds: Set<string>, validNodeIds?: Set<string>): void {
  if (!canUseStorage()) return;
  try {
    const store = readBrainMapLayout();
    let changed = false;
    for (const id of Object.keys(store)) {
      if (!validAnchorIds.has(id)) {
        delete store[id];
        changed = true;
        continue;
      }
      if (!validNodeIds) continue;
      const placement = store[id];
      for (const childId of Object.keys(placement.childOffsets)) {
        if (!validNodeIds.has(childId)) {
          delete placement.childOffsets[childId];
          changed = true;
        }
      }
    }
    if (changed) {
      localStorage.setItem(BRAIN_MAP_LAYOUT_STORAGE_KEY, JSON.stringify(store));
    }
  } catch {
    /* ignore */
  }
}

/** Clear all user-arranged map positions (Reset layout). */
export function clearBrainMapLayout(): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(BRAIN_MAP_LAYOUT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
