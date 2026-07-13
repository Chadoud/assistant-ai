import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCT_INVARIANTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_SRC_ROOT = path.resolve(PRODUCT_INVARIANTS_DIR, "..");

export type SourceMatch = {
  file: string;
  line: number;
  text: string;
};

const SOURCE_FILE_PATTERN = /\.(ts|tsx)$/;

/** Paths skipped when scanning for forbidden runtime patterns (tests, invariant definitions). */
const SYNTHETIC_PROGRESS_SCAN_IGNORE = [
  "productInvariants/",
  ".test.ts",
  ".test.tsx",
] as const;

/**
 * Read a file under `frontend/src` by path relative to that root.
 */
export function readFrontendSource(relativePath: string): string {
  const absolutePath = path.join(FRONTEND_SRC_ROOT, relativePath);
  return fs.readFileSync(absolutePath, "utf-8");
}

/** Normalize path separators so ignore rules work on Windows and POSIX. */
function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

function shouldSkipSyntheticProgressScan(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath);
  return SYNTHETIC_PROGRESS_SCAN_IGNORE.some((fragment) => normalized.includes(fragment));
}

function walkSourceFiles(dir: string, base = FRONTEND_SRC_ROOT): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "coverage") continue;
      files.push(...walkSourceFiles(absolutePath, base));
      continue;
    }
    if (!SOURCE_FILE_PATTERN.test(entry.name)) continue;
    files.push(path.relative(base, absolutePath));
  }

  return files;
}

/**
 * List `.ts` / `.tsx` files under `frontend/src`, optionally filtered.
 */
function listFrontendSourceFiles(options?: { skip?: (relativePath: string) => boolean }): string[] {
  return walkSourceFiles(FRONTEND_SRC_ROOT).filter((relativePath) => !options?.skip?.(relativePath));
}

/**
 * Return line-level matches for a regex across frontend source files.
 */
export function grepFrontendSource(
  pattern: RegExp,
  options?: { skip?: (relativePath: string) => boolean },
): SourceMatch[] {
  const matches: SourceMatch[] = [];

  for (const relativePath of listFrontendSourceFiles(options)) {
    const source = readFrontendSource(relativePath);
    const lines = source.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (pattern.test(line)) {
        matches.push({
          file: relativePath,
          line: index + 1,
          text: line.trim(),
        });
      }
      pattern.lastIndex = 0;
    }
  }

  return matches;
}

export function skipSyntheticProgressScan(relativePath: string): boolean {
  return shouldSkipSyntheticProgressScan(relativePath);
}
