/** Path waiting for the first Sort-tab visit toast (set during silent default-output seed). */
let pendingOutputFolderSortTabToastPath: string | null = null;

/**
 * Remember the auto-seeded output folder until the user opens the Sort tab.
 * @param path Resolved default output directory.
 */
export function markPendingOutputFolderSortTabToast(path: string): void {
  const trimmed = path.trim();
  if (!trimmed) return;
  pendingOutputFolderSortTabToastPath = trimmed;
}

/**
 * @returns Pending path and clears it so the toast is shown at most once.
 */
export function takePendingOutputFolderSortTabToast(): string | null {
  const path = pendingOutputFolderSortTabToastPath;
  pendingOutputFolderSortTabToastPath = null;
  return path;
}

/** @internal Test-only reset. */
export function resetPendingOutputFolderSortTabToastForTests(): void {
  pendingOutputFolderSortTabToastPath = null;
}
