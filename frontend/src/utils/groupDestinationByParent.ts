import { UNCERTAIN_FOLDER } from "../constants";
import { NO_DESTINATION_FOLDER_KEY } from "./folderDestinationSummary";
import { OTHER_REASON_LABEL } from "./topNWithOther";

/** One destination row under a parent area (or a special bucket). */
export interface ParentGroupLeaf {
  /** Full relative path key (matches donut / counts). */
  fullPath: string;
  count: number;
  /** Index of this row in the input `rows` array (for donut slice color alignment). */
  legendRowIndex: number;
  /**
   * Subfolder label: path after first segment, or whole name for flat paths.
   * Special buckets use the same string as `fullPath`.
   */
  leafLabel: string;
}

/** Grouped row: one parent "area" with one or more destination leaves. */
interface ParentGroupRow {
  /** First path segment, or full key for semantic specials (no path split). */
  parentKey: string;
  /** True when `parentKey` is Uncertain, Other, or (No destination). */
  isSpecialBucket: boolean;
  leaves: ParentGroupLeaf[];
  /** Sum of `leaves[].count`. */
  totalCount: number;
}

function isSpecialFolder(folder: string): boolean {
  return (
    folder === UNCERTAIN_FOLDER ||
    folder === OTHER_REASON_LABEL ||
    folder === NO_DESTINATION_FOLDER_KEY
  );
}

/**
 * Groups destination count rows by first path segment for a compact table view.
 * Donut remains one slice per `folder`; this is for area / subfolder breakdown only.
 */
export function groupDestinationByParent(
  rows: { folder: string; count: number }[]
): ParentGroupRow[] {
  const byParent = new Map<
    string,
    { isSpecialBucket: boolean; leaves: ParentGroupLeaf[] }
  >();

  rows.forEach((row, legendRowIndex) => {
    const { folder, count } = row;

    if (isSpecialFolder(folder)) {
      const key = `__special__\0${folder}`;
      let g = byParent.get(key);
      if (!g) {
        g = { isSpecialBucket: true, leaves: [] };
        byParent.set(key, g);
      }
      g.leaves.push({
        fullPath: folder,
        count,
        legendRowIndex,
        leafLabel: folder,
      });
      return;
    }

    const normalized = folder.replace(/\\/g, "/").trim();
    const segments = normalized
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const parentKey = segments[0] ?? folder;
    const leafLabel =
      segments.length <= 1 ? (segments[0] ?? folder) : segments.slice(1).join("/");

    let g = byParent.get(parentKey);
    if (!g) {
      g = { isSpecialBucket: false, leaves: [] };
      byParent.set(parentKey, g);
    }
    g.leaves.push({
      fullPath: folder,
      count,
      legendRowIndex,
      leafLabel,
    });
  });

  const out: ParentGroupRow[] = [];
  for (const [mapKey, { isSpecialBucket, leaves }] of byParent) {
    const parentKey = isSpecialBucket ? leaves[0]?.fullPath ?? mapKey : mapKey;
    leaves.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.fullPath.localeCompare(b.fullPath, undefined, { sensitivity: "base" });
    });
    const totalCount = leaves.reduce((s, l) => s + l.count, 0);
    out.push({ parentKey, isSpecialBucket, leaves, totalCount });
  }

  out.sort((a, b) => {
    if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
    return a.parentKey.localeCompare(b.parentKey, undefined, { sensitivity: "base" });
  });

  return out;
}
