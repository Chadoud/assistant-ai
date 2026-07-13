/**
 * Scan the repo for source files exceeding line-count thresholds.
 * Prints a markdown table to stdout (default) or JSON with --json.
 *
 * Usage:
 *   node scripts/audit-hotspots.cjs
 *   node scripts/audit-hotspots.cjs --json
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

const DEFAULT_RULES = [
  { label: "backend Python", glob: "**/*.py", baseDir: "backend", threshold: 400 },
  { label: "frontend TSX", glob: "**/*.tsx", baseDir: "frontend/src", threshold: 300 },
  { label: "frontend TS", glob: "**/*.ts", baseDir: "frontend/src", threshold: 400 },
  { label: "Electron JS", glob: "**/*.js", baseDir: "electron", threshold: 400 },
];

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-installer",
  "coverage",
  "lcov-report",
  "__pycache__",
  ".venv",
  "venv",
  "build",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
]);

const SKIP_FILE_SUFFIXES = [".min.js", ".bundle.js"];

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function shouldSkipDir(name) {
  return SKIP_DIR_NAMES.has(name) || name.startsWith(".");
}

function shouldSkipFile(relPath) {
  if (relPath.endsWith(".test.ts") || relPath.endsWith(".test.tsx")) return false;
  if (relPath.includes("/coverage/")) return true;
  return SKIP_FILE_SUFFIXES.some((suffix) => relPath.endsWith(suffix));
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      walkFiles(fullPath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    out.push(fullPath);
  }
  return out;
}

function countLines(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  if (text.length === 0) return 0;
  return text.split(/\r?\n/).length;
}

function matchesRule(filePath, rule) {
  const baseDir = path.join(root, rule.baseDir);
  if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) {
    return false;
  }
  const rel = path.relative(baseDir, filePath);
  if (shouldSkipFile(rel.replace(/\\/g, "/"))) return false;

  if (rule.glob === "**/*.py") return filePath.endsWith(".py");
  if (rule.glob === "**/*.tsx") return filePath.endsWith(".tsx");
  if (rule.glob === "**/*.ts") {
    return filePath.endsWith(".ts") && !filePath.endsWith(".tsx");
  }
  if (rule.glob === "**/*.js") return filePath.endsWith(".js");
  return false;
}

function collectHotspots() {
  const allFiles = walkFiles(root);
  const rows = [];

  for (const filePath of allFiles) {
    for (const rule of DEFAULT_RULES) {
      if (!matchesRule(filePath, rule)) continue;
      const lines = countLines(filePath);
      if (lines <= rule.threshold) continue;
      rows.push({
        category: rule.label,
        path: path.relative(root, filePath).replace(/\\/g, "/"),
        lines,
        threshold: rule.threshold,
        overBy: lines - rule.threshold,
      });
    }
  }

  rows.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
  return rows;
}

function printMarkdown(rows) {
  const generatedAt = new Date().toISOString().slice(0, 10);
  console.log(`# Hot-spot audit (${generatedAt})`);
  console.log("");
  console.log(
    "Files exceeding configured line thresholds. Regenerate with `node scripts/audit-hotspots.cjs`.",
  );
  console.log("");
  if (rows.length === 0) {
    console.log("_No files exceed the configured thresholds._");
    return;
  }
  console.log("| Category | Lines | Threshold | Path |");
  console.log("|----------|------:|----------:|------|");
  for (const row of rows) {
    console.log(`| ${row.category} | ${row.lines} | ${row.threshold} | \`${row.path}\` |`);
  }
  console.log("");
  console.log(`**Total flagged:** ${rows.length}`);
}

function printJson(rows) {
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rules: DEFAULT_RULES.map(({ label, baseDir, threshold, glob }) => ({
          label,
          baseDir,
          threshold,
          glob,
        })),
        hotspots: rows,
        total: rows.length,
      },
      null,
      2,
    ),
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/audit-hotspots.cjs [--json]");
    process.exit(0);
  }

  const rows = collectHotspots();
  if (args.json) {
    printJson(rows);
  } else {
    printMarkdown(rows);
  }
}

main();
