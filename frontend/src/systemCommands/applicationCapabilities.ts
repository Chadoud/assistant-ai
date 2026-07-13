/**
 * Human-facing grouping for `open_application` keys — same keys as
 * [knownApplicationKeys.ts](knownApplicationKeys.ts). Used for docs, tests, and future UI;
 * does not change launch behavior (see electron/knownApplications.js).
 */

import { KNOWN_APPLICATION_KEYS } from "./knownApplicationKeys";

/** Coarse category for filtering / documentation (not OS-specific). */
export type ApplicationCapabilityCategory =
  | "browser"
  | "communication"
  | "development"
  | "games"
  | "media"
  | "office"
  | "productivity"
  | "system"
  | "utilities";

/**
 * One category per curated app key. Keep in sync when adding keys to `knownApplicationKeys`.
 */
export const APPLICATION_KEY_CATEGORY: Record<string, ApplicationCapabilityCategory> = {
  vlc: "media",
  apple_music: "media",
  edge: "browser",
  chrome: "browser",
  firefox: "browser",
  discord: "communication",
  slack: "communication",
  telegram: "communication",
  whatsapp: "communication",
  zoom: "communication",
  msteams: "communication",
  mail: "communication",
  vscode: "development",
  notion: "productivity",
  obsidian: "productivity",
  steam: "games",
  epic_games: "games",
  battlenet: "games",
  notepad: "system",
  calculator: "system",
  explorer: "system",
  settings: "system",
  terminal: "system",
  photos: "system",
  wordpad: "office",
  winword: "office",
  task_manager: "utilities",
  mspaint: "utilities",
};

/** Keys whose launchers fail outside Windows (see knownApplications.js). */
export const WINDOWS_ONLY_APPLICATION_KEYS: ReadonlySet<string> = new Set([
  "notepad",
  "explorer",
  "task_manager",
  "wordpad",
  "mspaint",
]);

/** Keys whose launchers fail outside macOS. */
export const MACOS_ONLY_APPLICATION_KEYS: ReadonlySet<string> = new Set(["apple_music"]);

export function categoryForApplicationKey(key: string): ApplicationCapabilityCategory | undefined {
  return APPLICATION_KEY_CATEGORY[key];
}

/** Dev/test: throws if catalog and category map diverge. */
export function assertApplicationKeysAlignedWithCategories(): void {
  for (const k of KNOWN_APPLICATION_KEYS) {
    if (!(k in APPLICATION_KEY_CATEGORY)) {
      throw new Error(`applicationCapabilities: missing category for app key "${k}"`);
    }
  }
  for (const k of Object.keys(APPLICATION_KEY_CATEGORY)) {
    if (!KNOWN_APPLICATION_KEYS.has(k)) {
      throw new Error(`applicationCapabilities: unknown app key in map "${k}"`);
    }
  }
}
