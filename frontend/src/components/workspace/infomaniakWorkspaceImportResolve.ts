/** Infomaniak kDrive workspace import resolver — lists all drive files then yields per file. */

import type { WorkspaceFileTypeCategory } from "./workspaceFileTypeCategories";

export type InfomaniakMergePrefs = {
  enabled: boolean;
  /** kDrive drive ID (numeric string, empty = first drive). */
  driveId: string;
  typeCategories: WorkspaceFileTypeCategory[];
};

export type ProgressiveInfomaniakImportBatch = {
  item: { id: number; name: string; size?: number; driveId?: number };
  filteredFileCount: number;
  discoveredFileCount: number;
};

type InfomaniakFile = { id: number; name: string; size?: number; driveId?: number; drive_id?: number };

export type ListInfomaniakFilesFn = (payload?: {
  driveId?: number;
  recursive?: boolean;
}) => Promise<
  | { ok: true; files?: InfomaniakFile[]; drives?: Array<{ id: number; name: string }> }
  | { ok: false; reason?: string }
>;

const IK_FILE_EXTENSION_CATEGORIES: Record<WorkspaceFileTypeCategory, string[]> = {
  pdf: [".pdf"],
  images: [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif", ".heic"],
  documents: [".doc", ".docx", ".odt", ".txt", ".rtf", ".md", ".pptx", ".ppt", ".odp"],
  spreadsheets: [".xls", ".xlsx", ".csv", ".ods"],
  other: [],
};

function fileMatchesTypeCategories(name: string, categories: readonly WorkspaceFileTypeCategory[]): boolean {
  if (categories.length === 0) return false;
  const lower = name.toLowerCase();
  for (const cat of categories) {
    if (cat === "other") continue;
    if (IK_FILE_EXTENSION_CATEGORIES[cat].some((ext) => lower.endsWith(ext))) return true;
  }
  if (categories.includes("other")) {
    const matchedAny = (["pdf", "images", "documents", "spreadsheets"] as const).some((cat) =>
      IK_FILE_EXTENSION_CATEGORIES[cat].some((ext) => lower.endsWith(ext))
    );
    if (!matchedAny) return true;
  }
  return false;
}

export async function* streamProgressiveInfomaniakImportBatches(
  prefs: InfomaniakMergePrefs,
  listFn: ListInfomaniakFilesFn,
  options?: { signal?: AbortSignal }
): AsyncGenerator<ProgressiveInfomaniakImportBatch> {
  const signal = options?.signal;
  if (signal?.aborted) return;

  let driveId = prefs.driveId ? parseInt(prefs.driveId, 10) : NaN;

  // Auto-discover first drive if none specified.
  if (!driveId || isNaN(driveId)) {
    const drivesResult = await listFn({});
    if (!drivesResult.ok) {
      console.error("[infomaniakImportResolve] drives list failed:", (drivesResult as { ok: false; reason?: string }).reason);
      return;
    }
    const firstDrive = (drivesResult as { ok: true; drives?: Array<{ id: number }> }).drives?.[0];
    if (!firstDrive) {
      console.error("[infomaniakImportResolve] no drives found");
      return;
    }
    driveId = firstDrive.id;
  }

  if (signal?.aborted) return;

  const result = await listFn({ driveId, recursive: true });
  if (!result.ok) {
    console.error("[infomaniakImportResolve] files list failed:", (result as { ok: false; reason?: string }).reason);
    return;
  }

  const allFiles: InfomaniakFile[] = (result as { ok: true; files?: InfomaniakFile[] }).files ?? [];
  const filtered = allFiles.filter((f) => fileMatchesTypeCategories(f.name, prefs.typeCategories));

  const filteredFileCount = filtered.length;
  const discoveredFileCount = allFiles.length;

  for (const item of filtered) {
    if (signal?.aborted) return;
    yield {
      item: { id: item.id, name: item.name, size: item.size, driveId: item.driveId ?? item.drive_id ?? driveId },
      filteredFileCount,
      discoveredFileCount,
    };
  }
}
