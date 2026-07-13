/**
 * Joins a base path and a child segment using the same separator as the base.
 * Handles mixed Windows (backslash) and POSIX (forward slash) paths correctly.
 */
export function joinPath(base: string, child: string): string {
  if (!base) return child;
  if (!child) return base;
  // Detect separator from base path — Windows paths typically start with a drive letter
  const sep = base.includes("\\") ? "\\" : "/";
  const cleanBase = base.replace(/[/\\]+$/, "");
  return `${cleanBase}${sep}${child}`;
}
