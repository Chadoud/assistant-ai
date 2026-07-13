import { useCallback, useState } from "react";
import { api } from "../api";
import type { FolderNode } from "../api";
import { inlineErrorMessage } from "../utils/userGuidance";

export function useFolderTree(outputDir: string) {
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refreshTree = useCallback(async () => {
    if (!outputDir) return;
    try {
      const result = await api.folderTree(outputDir);
      setFolderTree(result.tree);
      setRefreshError(null);
    } catch (e: unknown) {
      setRefreshError(inlineErrorMessage(e));
    }
  }, [outputDir]);

  const dismissRefreshError = useCallback(() => setRefreshError(null), []);

  return { folderTree, refreshTree, refreshError, dismissRefreshError };
}
