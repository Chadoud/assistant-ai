/**
 * Curated app keys the model may use with `open_application` (no paths).
 * Keep in sync with electron/knownApplications.js
 */
export const KNOWN_APPLICATION_LABELS: Record<string, string> = {
  discord: "Discord",
  slack: "Slack",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  zoom: "Zoom",
  vscode: "Visual Studio Code",
  notion: "Notion",
  obsidian: "Obsidian",
  msteams: "Microsoft Teams",
  edge: "Microsoft Edge",
  chrome: "Google Chrome",
  firefox: "Mozilla Firefox",
  notepad: "Notepad",
  calculator: "Calculator",
  explorer: "File Explorer",
  settings: "System Settings",
  steam: "Steam",
  epic_games: "Epic Games Launcher",
  battlenet: "Battle.net",
  vlc: "VLC",
  terminal: "Terminal",
  apple_music: "Apple Music",
  mail: "Mail",
  /** Windows-only: Task Manager (`taskmgr`). */
  task_manager: "Task Manager",
  /** Windows-only: WordPad. */
  wordpad: "WordPad",
  /** Microsoft Word (Windows/macOS). Distinct from WordPad (`wordpad`). */
  winword: "Microsoft Word",
  /** Windows-only: Microsoft Paint. */
  mspaint: "Paint",
  /** Photos app (protocol on Windows, Photos on macOS, best-effort on Linux). */
  photos: "Photos",
};

export const KNOWN_APPLICATION_KEYS = new Set(Object.keys(KNOWN_APPLICATION_LABELS));

export function labelForApplicationKey(key: string): string {
  return KNOWN_APPLICATION_LABELS[key] ?? key.replace(/_/g, " ");
}
