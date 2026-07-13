import type { AppSettings } from "../types/settings";

const LOCAL_INTENT_PATTERNS: RegExp[] = [
  /\bsort\b.*\b(file|folder|mail|email|drive|inbox|document)/i,
  /\b(sort my|organize my|file my|move (these )?files)\b/i,
  /\b(gmail|google drive|onedrive|outlook|dropbox|icloud|notion|slack|whatsapp|infomaniak)\b/i,
  /\b(connect|disconnect)\b.*\b(account|integration|source|provider)\b/i,
  /\b(calendar|meeting|transcri|inbox zero)\b/i,
  /\b(my memories|remember this|save to memory)\b/i,
  /^\/(sort|gmail|mail|calendar|agent|codegen)\b/i,
  /\bcodegen\b/i,
  /\brun (an )?agent\b/i,
  /\bscan (this|my|the)\b/i,
];

/**
 * True when the user's message needs the local Python app service (files, mail, tools, sort).
 */
export function messageNeedsLocalAppService(text: string, settings?: AppSettings): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (LOCAL_INTENT_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  if (
    settings?.assistantToolsEnabled &&
    /\b(open|launch|send|delete|schedule|create|find my|list my|move|rename)\b/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}
