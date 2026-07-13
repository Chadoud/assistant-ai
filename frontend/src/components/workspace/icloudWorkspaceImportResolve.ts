/** iCloud Drive workspace import resolver — lists local sync folder files then yields per file. */

import type { WorkspaceFileTypeCategory } from "./workspaceFileTypeCategories";

export type ICloudMergePrefs = {
  enabled: boolean;
  typeCategories: WorkspaceFileTypeCategory[];
};

export type ProgressiveICloudImportBatch = {
  item: { path: string; name: string; size?: number };
  filteredFileCount: number;
  discoveredFileCount: number;
};

type ICloudFile = { path: string; name: string; size?: number; lastModified?: string };

type ListICloudFilesFn = (payload?: Record<string, never>) => Promise<
  | { ok: true; files: ICloudFile[]; capped?: boolean }
  | { ok: false; reason?: string }
>;

const ICLOUD_FILE_EXTENSION_CATEGORIES: Record<WorkspaceFileTypeCategory, string[]> = {
  pdf: [".pdf"],
  images: [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif", ".heic"],
  documents: [".doc", ".docx", ".odt", ".txt", ".rtf", ".md", ".pptx", ".ppt", ".odp"],
  spreadsheets: [".xls", ".xlsx", ".csv", ".ods", ".numbers"],
  other: [],
};

function fileMatchesTypeCategories(name: string, categories: readonly WorkspaceFileTypeCategory[]): boolean {
  if (categories.length === 0) return false;
  const lower = name.toLowerCase();
  for (const cat of categories) {
    if (cat === "other") continue;
    if (ICLOUD_FILE_EXTENSION_CATEGORIES[cat].some((ext) => lower.endsWith(ext))) return true;
  }
  if (categories.includes("other")) {
    const matchedAny = (["pdf", "images", "documents", "spreadsheets"] as const).some((cat) =>
      ICLOUD_FILE_EXTENSION_CATEGORIES[cat].some((ext) => lower.endsWith(ext))
    );
    if (!matchedAny) return true;
  }
  return false;
}

export async function* streamProgressiveICloudImportBatches(
  prefs: ICloudMergePrefs,
  listFn: ListICloudFilesFn,
  options?: { signal?: AbortSignal }
): AsyncGenerator<ProgressiveICloudImportBatch> {
  const signal = options?.signal;
  if (signal?.aborted) return;

  const result = await listFn({});
  if (!result.ok) {
    console.error("[icloudImportResolve] list failed:", (result as { ok: false; reason?: string }).reason);
    return;
  }

  const allFiles: ICloudFile[] = result.files ?? [];
  const filtered = allFiles.filter((f) => fileMatchesTypeCategories(f.name, prefs.typeCategories));

  const filteredFileCount = filtered.length;
  const discoveredFileCount = allFiles.length;

  for (const item of filtered) {
    if (signal?.aborted) return;
    yield { item: { path: item.path, name: item.name, size: item.size }, filteredFileCount, discoveredFileCount };
  }
}
