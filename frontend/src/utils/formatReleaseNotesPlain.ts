/**
 * Convert CHANGELOG markdown snippets to plain text for the update modal.
 * Keep in sync with scripts/format-changelog-notes.cjs
 */
export function formatReleaseNotesPlain(input: string): string {
  const lines: string[] = [];
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
