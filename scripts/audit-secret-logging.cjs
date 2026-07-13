/**
 * Scan backend/ and electron/ for log lines that may emit raw secrets.
 * Exit 1 when suspicious patterns are found (P1-1.3.2).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const scanDirs = ["backend", "electron"];

const skipPathParts = ["__pycache__", "node_modules", ".venv", `${path.sep}scripts${path.sep}`];

const suspiciousPatterns = [
  {
    id: "log-api-key-value",
    re: /(?:logger|logging|console)\.(?:info|debug|warning|error|log)\([^)]*\bapi[_-]?key\b[^)]*['"][A-Za-z0-9_-]{8,}/i,
  },
  {
    id: "log-token-literal",
    re: /(?:logger|logging|console)\.(?:info|debug|warning|error|log)\([^)]*['"](?:sk-|AIza|Bearer\s+[A-Za-z0-9._-]{10,})/i,
  },
  {
    id: "log-fstring-secret",
    re: /(?:logger|logging)\.(?:info|debug|warning|error)\(\s*f["'][^"']*\{(?:api_key|access_token|refresh_token|password)\}/i,
  },
];

const allowlistSubstrings = [
  "REDACTED",
  "[REDACTED]",
  "token_relay: stored token for provider",
  "api_key_error",
  "missing_key",
  "not configured",
  "oauth_env",
  "env_present",
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (skipPathParts.some((part) => p.includes(part))) continue;
      walk(p, out);
    } else if (/\.(py|js)$/.test(name.name)) {
      out.push(p);
    }
  }
  return out;
}

function main() {
  const hits = [];
  for (const dir of scanDirs) {
    for (const file of walk(path.join(root, dir))) {
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, idx) => {
        if (allowlistSubstrings.some((s) => line.includes(s))) return;
        for (const { id, re } of suspiciousPatterns) {
          if (re.test(line)) {
            hits.push({
              file: path.relative(root, file),
              line: idx + 1,
              id,
              text: line.trim().slice(0, 120),
            });
          }
        }
      });
    }
  }

  if (hits.length) {
    console.error("Potential secret logging patterns found:");
    for (const h of hits) {
      console.error(`  [${h.id}] ${h.file}:${h.line}  ${h.text}`);
    }
    process.exit(1);
  }

  console.log("Secret logging audit OK: no suspicious patterns in backend/ or electron/");
}

main();
