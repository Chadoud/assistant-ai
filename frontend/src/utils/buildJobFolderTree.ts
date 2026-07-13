import type { FileEntry, FolderNode, Job } from "../api";
import { joinPath } from "./path";

function splitPathSegments(value: string): string[] {
  return value.split(/[/\\]+/).filter(Boolean);
}

/** Folder segments + file name for one sorted file, relative to the output dir. */
function resolveFolderSegments(
  file: FileEntry,
  outputDir: string,
): { segments: string[]; fileName: string } | null {
  const dest = file.dest_path?.trim();
  if (dest) {
    let rel = dest;
    if (outputDir && dest.startsWith(outputDir)) {
      rel = dest.slice(outputDir.length);
    }
    const parts = splitPathSegments(rel);
    const fileName = parts.pop();
    if (!fileName) return null;
    return { segments: parts, fileName };
  }
  const folder = (file.final_folder ?? file.suggested_folder)?.trim();
  if (!folder) return null;
  return { segments: splitPathSegments(folder), fileName: file.name };
}

function sortTree(nodes: FolderNode[]): FolderNode[] {
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  for (const node of nodes) {
    node.files.sort((a, b) => a.localeCompare(b));
    if (node.children?.length) sortTree(node.children);
  }
  return nodes;
}

/**
 * Build a folder tree from a single job's sorted files (scoped to this run only),
 * so the post-sort view shows just what was sorted — not the entire output directory.
 */
export function buildJobFolderTree(job: Job | null): FolderNode[] {
  if (!job) return [];
  const outputDir = job.config?.output_dir ?? "";
  const roots: FolderNode[] = [];
  const nodeByPath = new Map<string, FolderNode>();

  for (const file of job.files) {
    const resolved = resolveFolderSegments(file, outputDir);
    if (!resolved || resolved.segments.length === 0) continue;

    let currentPath = outputDir;
    let siblings = roots;
    let leaf: FolderNode | null = null;

    for (const segment of resolved.segments) {
      currentPath = joinPath(currentPath, segment);
      let node = nodeByPath.get(currentPath);
      if (!node) {
        node = { name: segment, path: currentPath, files: [], children: [] };
        nodeByPath.set(currentPath, node);
        siblings.push(node);
      }
      leaf = node;
      siblings = node.children!;
    }

    if (leaf && !leaf.files.includes(resolved.fileName)) {
      leaf.files.push(resolved.fileName);
    }
  }

  return sortTree(roots);
}
