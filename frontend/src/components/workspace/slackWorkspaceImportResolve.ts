/** Slack workspace import resolver — collects all file pages then yields per file. */

import type { WorkspaceFileTypeCategory } from "./workspaceFileTypeCategories";

export type SlackMergePrefs = {
  enabled: boolean;
  /** Slack channel ID to filter files (empty = all channels). */
  channelId: string;
  typeCategories: WorkspaceFileTypeCategory[];
};

export type ProgressiveSlackImportBatch = {
  file: { id: string; name: string; size?: number; url_private?: string; url_private_download?: string };
  filteredFileCount: number;
  discoveredFileCount: number;
};

type SlackFile = {
  id: string;
  name: string;
  size?: number;
  url_private?: string;
  url_private_download?: string;
  filetype?: string;
};

type ListSlackFilesFn = (payload: { channel?: string; cursor?: string }) => Promise<
  | { ok: true; files: SlackFile[]; nextCursor?: string | null }
  | { ok: false; reason?: string }
>;

const SLACK_FILE_EXTENSION_CATEGORIES: Record<WorkspaceFileTypeCategory, string[]> = {
  pdf: [".pdf"],
  images: [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif"],
  documents: [".doc", ".docx", ".odt", ".txt", ".rtf", ".md", ".pptx", ".ppt"],
  spreadsheets: [".xls", ".xlsx", ".csv", ".ods"],
  other: [],
};

function slackFileMatchesCategories(file: SlackFile, categories: readonly WorkspaceFileTypeCategory[]): boolean {
  if (categories.length === 0) return false;
  const lower = (file.name ?? "").toLowerCase();
  for (const cat of categories) {
    if (cat === "other") continue;
    if (SLACK_FILE_EXTENSION_CATEGORIES[cat].some((ext) => lower.endsWith(ext))) return true;
  }
  if (categories.includes("other")) {
    const matchedAny = (["pdf", "images", "documents", "spreadsheets"] as const).some((cat) =>
      SLACK_FILE_EXTENSION_CATEGORIES[cat].some((ext) => lower.endsWith(ext))
    );
    if (!matchedAny) return true;
  }
  return false;
}

export async function* streamProgressiveSlackImportBatches(
  prefs: SlackMergePrefs,
  listFn: ListSlackFilesFn,
  options?: { signal?: AbortSignal }
): AsyncGenerator<ProgressiveSlackImportBatch> {
  const signal = options?.signal;
  const allFiles: SlackFile[] = [];

  let cursor: string | undefined;
  for (;;) {
    if (signal?.aborted) return;
    const result = await listFn({ channel: prefs.channelId || undefined, cursor });
    if (!result.ok) {
      console.error("[slackImportResolve] list failed:", (result as { ok: false; reason?: string }).reason);
      break;
    }
    allFiles.push(...result.files);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }

  if (signal?.aborted) return;

  const filtered = allFiles.filter((f) => slackFileMatchesCategories(f, prefs.typeCategories));
  const filteredFileCount = filtered.length;
  const discoveredFileCount = allFiles.length;

  for (const file of filtered) {
    if (signal?.aborted) return;
    yield { file, filteredFileCount, discoveredFileCount };
  }
}
