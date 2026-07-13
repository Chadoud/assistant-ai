import type { FolderNode } from "../api";

function recursiveFileCount(folder: FolderNode): number {
  return (
    folder.files.length +
    (folder.children ?? []).reduce((sum, child) => sum + recursiveFileCount(child), 0)
  );
}

/**
 * Flatten nested folder tree into relative destination strings (e.g. Career/Job Applications)
 * for pickers and reassignment UI.
 */
export function flattenFolderRelPaths(
  nodes: FolderNode[],
  prefixParts: string[] = []
): { value: string; label: string; fileCount: number }[] {
  const out: { value: string; label: string; fileCount: number }[] = [];
  for (const n of nodes) {
    const parts = [...prefixParts, n.name];
    const value = parts.join("/");
    out.push({ value, label: value, fileCount: recursiveFileCount(n) });
    if (n.children?.length) {
      out.push(...flattenFolderRelPaths(n.children, parts));
    }
  }
  return out;
}
