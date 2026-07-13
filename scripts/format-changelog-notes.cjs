#!/usr/bin/env node
/**
 * Convert a CHANGELOG.md section snippet to plain text for latest.json / update UI.
 * Keep in sync with frontend/src/utils/formatReleaseNotesPlain.ts
 */

function formatReleaseNotesPlain(input) {
  const lines = [];
  for (const raw of String(input || "").split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
      continue;
    }
    let line = trimmed;
    line = line.replace(/^#{1,6}\s+/, "");
    line = line.replace(/^[-*+]\s+/, "• ");
    line = line.replace(/\*\*([^*]+)\*\*/g, "$1");
    line = line.replace(/\*([^*]+)\*/g, "$1");
    line = line.replace(/`([^`]+)`/g, "$1");
    lines.push(line);
  }
  return lines.join("\n").trim();
}

if (require.main === module) {
  const fs = require("fs");
  const text = fs.readFileSync(0, "utf8");
  process.stdout.write(JSON.stringify(formatReleaseNotesPlain(text)));
}

module.exports = { formatReleaseNotesPlain };
