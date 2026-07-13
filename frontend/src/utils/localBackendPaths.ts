/**
 * The Python backend resolves real paths on disk. Browser drag/drop only exposes
 * file names (no `File.path`), so those strings are not usable for analyze.
 */

function pathLooksUsableForLocalBackend(p: string): boolean {
  const t = p.trim();
  if (!t) return false;
  if (t.startsWith("~/")) return true;
  if (t === "~") return false;
  if (t.startsWith("/")) return true;
  if (/^[A-Za-z]:[\\/]/.test(t)) return true;
  if (t.startsWith("\\\\")) return true;
  return false;
}

export function allPathsUsableForLocalBackend(paths: string[]): boolean {
  return paths.length > 0 && paths.every(pathLooksUsableForLocalBackend);
}
