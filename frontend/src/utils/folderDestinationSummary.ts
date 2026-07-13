import type { FileEntry } from "../api";

const REVIEW_STATUSES: ReadonlySet<FileEntry["status"]> = new Set(["review_ready", "error"]);

/** Bucket key when no destination is set — keep in sync with `groupDestinationByParent` specials. */
export const NO_DESTINATION_FOLDER_KEY = "(No destination)";

/** Count files in review by effective destination (`final_folder` or `suggested_folder`). */
export function folderDestinationCounts(files: FileEntry[]): { folder: string; count: number }[] {
  const map = new Map<string, number>();
  for (const f of files) {
    if (!REVIEW_STATUSES.has(f.status)) continue;
    const raw = (f.final_folder ?? f.suggested_folder)?.trim();
    const key = raw && raw.length > 0 ? raw : NO_DESTINATION_FOLDER_KEY;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.folder.localeCompare(b.folder, undefined, { sensitivity: "base" });
    });
}
