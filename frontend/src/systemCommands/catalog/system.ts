import type { SystemCommandCatalogEntry, SystemCommandIdV1 } from "./types";

export const systemSystemCommandCatalog = {
  save_memory: {
    risk: "low",
    description:
      "Persist a preference or context item for future sessions. Args: {category: identity|preferences|projects|context|notes, key: string, value: string}",
  },
  terminal_safe: {
    risk: "medium",
    description:
      "Run a read-only/diagnostic terminal command from the safe allowlist. Args: {cmd: string}",
  },
  get_running_apps: {
    risk: "low",
    description: "Get a list of currently running applications on this system.",
  },
  system_volume: {
    risk: "medium",
    description: "Set the system audio volume. Args: {level: 0–100}",
  },
  open_app: {
    risk: "medium",
    description:
      "Open any installed application by name (e.g. Chrome, Spotify, Calculator). Args: {app_name: string}",
  },
  close_app: {
    risk: "medium",
    description:
      "Close/quit a running application by name (e.g. WhatsApp, Spotify, Chrome). Args: {app_name: string}",
  },
  web_search: {
    risk: "low",
    description:
      "Search the web and return inline results to the assistant. In voice mode: returns a grounded answer or result snippets. On desktop: can also open the browser to show results. Args: {query: string, max_results?: number, mode?: 'web'|'news', depth?: 'answer'|'snippet', language?: string}",
  },
  browser_control: {
    risk: "medium",
    description:
      "Open any URL in the default browser. If no http(s) prefix, treats as search query. Args: {url: string, action?: string}",
  },
  youtube_video: {
    risk: "low",
    description:
      "Open YouTube search results or trending in the default browser. Args: {query: string, action?: 'play'|'trending', region?: string}",
  },
  reminder: {
    risk: "low",
    description:
      "Show a desktop notification immediately or at a scheduled date/time. Args: {message: string, date?: 'YYYY-MM-DD', time?: 'HH:MM'}",
  },
  computer_settings: {
    risk: "medium",
    description:
      "Control OS settings: screenshot, volume, mute, lock screen, open task manager / file explorer. Args: {action: string, value?: string}",
  },
} satisfies Partial<Record<SystemCommandIdV1, SystemCommandCatalogEntry>>;
