import { UNCERTAIN_FOLDER } from "../constants";
import { OTHER_REASON_LABEL } from "./topNWithOther";

/** Sentinel returned for Uncertain — donut, legend, and chips resolve to a white/grey hatch. */
export const DESTINATION_UNCERTAIN_SLICE = "__dest_uncertain_hatch__" as const;

/** Shared class for diagonal white/grey stripes (see `index.css`). */
export const UNCERTAIN_DESTINATION_HATCH_CLASS = "uncertain-destination-hatch";

export function isDestinationUncertainSliceColor(value: string): boolean {
  return value === DESTINATION_UNCERTAIN_SLICE;
}

/** First segments: same hues as `DestinationFolderDonut`; keep in sync. */
export const DESTINATION_SLICE_COLORS = [
  "#10b981",
  "#f59e0b",
  "#6366f1",
  "var(--accent)",
  "var(--info)",
  "var(--error)",
  "#3730a3",
  "#14b8a6",
  "#f472b6",
] as const;

export type DestinationCountRow = { folder: string; count: number };

/**
 * Hue for one destination bucket — matches donut slices and legend dots.
 *
 * @param folder - Raw folder key (same as job file `suggested_folder` / `final_folder`).
 * @param i - Row index in the current legend row list (display or expanded full).
 */
export function destinationFolderSliceColor(folder: string, i: number): string {
  if (folder === UNCERTAIN_FOLDER) return DESTINATION_UNCERTAIN_SLICE;
  if (folder === OTHER_REASON_LABEL) return "var(--text-muted)";
  return DESTINATION_SLICE_COLORS[i % DESTINATION_SLICE_COLORS.length];
}

/**
 * Resolves the legend color for a file’s destination so chips match the destination folders card.
 *
 * Uses `display` row order first (same as collapsed donut). If the folder only appears in the
 * merged “Other” tail, uses the Other row’s color.
 */
export function destinationLegendColorForFolder(
  folder: string,
  displayRows: DestinationCountRow[],
  fullRows: DestinationCountRow[]
): string {
  const trimmed = folder.trim();
  if (!trimmed) return destinationFolderSliceColor(folder, 0);

  const displayIdx = displayRows.findIndex((r) => r.folder === trimmed);
  if (displayIdx >= 0) return destinationFolderSliceColor(trimmed, displayIdx);

  const inFull = fullRows.some((r) => r.folder === trimmed);
  const otherIdx = displayRows.findIndex((r) => r.folder === OTHER_REASON_LABEL);
  if (inFull && otherIdx >= 0 && !displayRows.some((r) => r.folder === trimmed)) {
    return destinationFolderSliceColor(OTHER_REASON_LABEL, otherIdx);
  }

  const fullIdx = fullRows.findIndex((r) => r.folder === trimmed);
  if (fullIdx >= 0) return destinationFolderSliceColor(trimmed, fullIdx);

  return destinationFolderSliceColor(trimmed, 0);
}
