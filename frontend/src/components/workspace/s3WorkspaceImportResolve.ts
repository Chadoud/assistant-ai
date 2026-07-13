/** S3 workspace import resolver — paginates all objects then yields per item. */

import type { WorkspaceFileTypeCategory } from "./workspaceFileTypeCategories";

export type S3MergePrefs = {
  enabled: boolean;
  /** S3 prefix filter (empty = all objects in the bucket). */
  prefix: string;
  typeCategories: WorkspaceFileTypeCategory[];
};

export type ProgressiveS3ImportBatch = {
  item: { key: string; size?: number };
  filteredFileCount: number;
  discoveredFileCount: number;
};

type S3Object = { key: string; size?: number; lastModified?: string };

type ListS3ObjectsFn = (payload: { continuationToken?: string; prefix?: string }) => Promise<
  | { ok: true; items: S3Object[]; nextContinuationToken?: string | null }
  | { ok: false; reason?: string }
>;

const S3_FILE_EXTENSION_CATEGORIES: Record<WorkspaceFileTypeCategory, string[]> = {
  pdf: [".pdf"],
  images: [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif", ".svg", ".heic"],
  documents: [".doc", ".docx", ".odt", ".txt", ".rtf", ".md", ".pptx", ".ppt", ".odp"],
  spreadsheets: [".xls", ".xlsx", ".csv", ".ods"],
  other: [],
};

function keyMatchesTypeCategories(key: string, categories: readonly WorkspaceFileTypeCategory[]): boolean {
  if (categories.length === 0) return false;
  const basename = key.split("/").pop() ?? key;
  const lower = basename.toLowerCase();
  for (const cat of categories) {
    if (cat === "other") continue;
    if (S3_FILE_EXTENSION_CATEGORIES[cat].some((ext) => lower.endsWith(ext))) return true;
  }
  if (categories.includes("other")) {
    const matchedAny = (["pdf", "images", "documents", "spreadsheets"] as const).some((cat) =>
      S3_FILE_EXTENSION_CATEGORIES[cat].some((ext) => lower.endsWith(ext))
    );
    if (!matchedAny) return true;
  }
  return false;
}

export async function* streamProgressiveS3ImportBatches(
  prefs: S3MergePrefs,
  listFn: ListS3ObjectsFn,
  options?: { signal?: AbortSignal }
): AsyncGenerator<ProgressiveS3ImportBatch> {
  const signal = options?.signal;
  const allItems: S3Object[] = [];

  // Collect all pages first to get accurate totals.
  let continuationToken: string | undefined;
  for (;;) {
    if (signal?.aborted) return;
    const result = await listFn({ continuationToken, prefix: prefs.prefix });
    if (!result.ok) {
      console.error("[s3ImportResolve] list failed:", (result as { ok: false; reason?: string }).reason);
      break;
    }
    allItems.push(...result.items);
    if (!result.nextContinuationToken) break;
    continuationToken = result.nextContinuationToken;
  }

  if (signal?.aborted) return;

  const filtered = allItems.filter((item) => keyMatchesTypeCategories(item.key, prefs.typeCategories));
  const filteredFileCount = filtered.length;
  const discoveredFileCount = allItems.length;

  for (const item of filtered) {
    if (signal?.aborted) return;
    yield { item: { key: item.key, size: item.size }, filteredFileCount, discoveredFileCount };
  }
}
