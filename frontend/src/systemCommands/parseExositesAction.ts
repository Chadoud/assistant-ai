import { validateParsedCommand } from "./catalog";
import type { ParsedSystemCommandV1 } from "./catalog";

/**
 * Match ```exosites-action ... ``` (case-insensitive on tag).
 * After the tag, allow optional whitespace/newline so models that put `{` on the same line still parse.
 */
const FENCE_REGEX = /```\s*exosites-action\s*([\s\S]*?)```/i;

/**
 * Parse a single JSON object, or multiple JSON objects (one per line, NDJSON) when the model
 * outputs tool-style blobs. Returns the first line/object that passes validation.
 */
function tryFirstValidCommand(rawBlock: string):
  | { ok: true; command: ParsedSystemCommandV1 }
  | { ok: false; error: string } {
  const trimmed = rawBlock.trim();
  if (!trimmed) {
    return { ok: false, error: "invalid_json" };
  }

  let whole: unknown;
  let wholeParsed = false;
  try {
    whole = JSON.parse(trimmed);
    wholeParsed = true;
  } catch {
    whole = undefined;
  }

  if (wholeParsed && whole !== undefined) {
    const v = validateParsedCommand(whole);
    if (v.ok) {
      return v;
    }
  }

  for (const line of trimmed.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("{")) {
      continue;
    }
    try {
      const parsed = JSON.parse(t) as unknown;
      const v = validateParsedCommand(parsed);
      if (v.ok) {
        return v;
      }
    } catch {
      /* try next line */
    }
  }

  if (wholeParsed && whole !== undefined) {
    const v = validateParsedCommand(whole);
    return { ok: false, error: v.ok ? "invalid_json" : v.error };
  }

  return { ok: false, error: "invalid_json" };
}

/**
 * Extract at most one validated command from assistant text and return text safe to display.
 */
export function extractExositesAction(assistantText: string): {
  displayText: string;
  command: ParsedSystemCommandV1 | null;
  parseError: string | null;
} {
  const m = assistantText.match(FENCE_REGEX);
  if (!m) {
    return {
      displayText: stripToolCallsPrefix(assistantText.trimEnd()),
      command: null,
      parseError: null,
    };
  }
  const rawBlock = (m[1] ?? "").trim();
  const result = tryFirstValidCommand(rawBlock);
  if (!result.ok) {
    return {
      displayText: stripFenceForDisplay(assistantText, m[0]),
      command: null,
      parseError: result.error === "invalid_json" ? "invalid_json" : result.error,
    };
  }
  return {
    displayText: stripFenceForDisplay(assistantText, m[0]).trimEnd(),
    command: result.command,
    parseError: null,
  };
}

/** Models sometimes prepend tool-style markers; hide them in chat. */
function stripToolCallsPrefix(text: string): string {
  return text.replace(/^\s*\[TOOL_CALLS\]\s*/i, "").trimStart();
}

function stripFenceForDisplay(full: string, matchedFence: string): string {
  return stripToolCallsPrefix(
    full.replace(matchedFence, "").replace(/\n{3,}/g, "\n\n").trim()
  );
}
