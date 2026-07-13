/**
 * Curated app launchers — no user/model-provided paths. Keys are the only variable the model may send.
 * Keep in sync with frontend/src/systemCommands/knownApplicationKeys.ts
 */

const { shell } = require("electron");
const { execFile } = require("child_process");
const { promisify } = require("util");
const os = require("os");

const execFileAsync = promisify(execFile);

async function openExternalSafe(uri) {
  await shell.openExternal(uri);
}

/** @param {string} cmd Windows command for `start` (fixed string from this file only). */
async function winStart(cmd) {
  await execFileAsync("cmd.exe", ["/d", "/s", "/c", "start", "", cmd], { windowsHide: true });
}

async function darwinOpenApp(name) {
  await execFileAsync("open", ["-a", name]);
}

/**
 * @returns {Promise<{ ok: boolean; reason?: string }>}
 */
async function launchKnownApplication(key) {
  if (typeof key !== "string" || !LAUNCHERS[key]) {
    return { ok: false, reason: "unknown_app" };
  }
  try {
    await LAUNCHERS[key]();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: msg.slice(0, 200) };
  }
}

const LAUNCHERS = {
  // --- Communication (protocols) ---
  discord: () => openExternalSafe("discord://"),
  slack: () => openExternalSafe("slack://"),
  telegram: () => openExternalSafe("tg://"),
  whatsapp: () => openExternalSafe("whatsapp://"),
  zoom: () => openExternalSafe("zoommtg://"),
  vscode: () => openExternalSafe("vscode:"),
  notion: () => openExternalSafe("notion://"),
  obsidian: () => openExternalSafe("obsidian://"),
  msteams: () => openExternalSafe("msteams://"),
  edge: () => openExternalSafe("microsoft-edge:"),
  // --- Browsers (multi-OS) ---
  chrome: async () => {
    const p = process.platform;
    if (p === "win32") {
      await winStart("chrome");
      return;
    }
    if (p === "darwin") {
      await darwinOpenApp("Google Chrome");
      return;
    }
    try {
      await execFileAsync("google-chrome-stable", ["about:blank"], { shell: false });
    } catch {
      await execFileAsync("google-chrome", ["about:blank"], { shell: false });
    }
  },
  firefox: async () => {
    const p = process.platform;
    if (p === "win32") {
      await winStart("firefox");
      return;
    }
    if (p === "darwin") {
      await darwinOpenApp("Firefox");
      return;
    }
    await execFileAsync("firefox", [], { shell: true });
  },
  // --- System utilities (OS-specific where noted) ---
  notepad: async () => {
    const p = process.platform;
    if (p === "win32") {
      await execFileAsync("notepad.exe", [], { windowsHide: true });
      return;
    }
    if (p === "darwin") {
      await execFileAsync("open", ["-a", "TextEdit"]);
      return;
    }
    await execFileAsync("gedit", [], { shell: true });
  },
  calculator: async () => {
    const p = process.platform;
    if (p === "win32") {
      await winStart("calc");
      return;
    }
    if (p === "darwin") {
      await execFileAsync("open", ["-a", "Calculator"]);
      return;
    }
    await execFileAsync("gnome-calculator", [], { shell: true });
  },
  explorer: async () => {
    const p = process.platform;
    if (p === "win32") {
      await execFileAsync("explorer.exe", [], { windowsHide: true });
      return;
    }
    if (p === "darwin") {
      // Open the user's home in Finder (explorer's closest equivalent).
      await execFileAsync("open", [os.homedir()]);
      return;
    }
    await execFileAsync("xdg-open", [os.homedir()], { shell: true });
  },
  settings: async () => {
    const p = process.platform;
    if (p === "win32") {
      await openExternalSafe("ms-settings:");
      return;
    }
    if (p === "darwin") {
      await execFileAsync("open", ["x-apple.systempreferences:"]);
      return;
    }
    await execFileAsync("gnome-control-center", [], { shell: true });
  },
  // --- Game launchers ---
  steam: () => openExternalSafe("steam://"),
  epic_games: () => openExternalSafe("com.epicgames.launcher://"),
  battlenet: () => openExternalSafe("battlenet://"),
  vlc: async () => {
    const p = process.platform;
    if (p === "win32") {
      await winStart("vlc");
      return;
    }
    if (p === "darwin") {
      await darwinOpenApp("VLC");
      return;
    }
    await execFileAsync("vlc", [], { shell: true });
  },
  terminal: async () => {
    const p = process.platform;
    if (p === "win32") {
      try {
        await execFileAsync("wt.exe", [], { windowsHide: true });
      } catch {
        await winStart("cmd");
      }
      return;
    }
    if (p === "darwin") {
      await execFileAsync("open", ["-a", "Terminal"]);
      return;
    }
    await execFileAsync("x-terminal-emulator", [], { shell: true });
  },
  /** Apple Music (macOS). */
  apple_music: async () => {
    if (process.platform !== "darwin") {
      throw new Error("apple_music_macos_only");
    }
    await darwinOpenApp("Music");
  },
  mail: () => openExternalSafe("mailto:"),
  task_manager: async () => {
    const p = process.platform;
    if (p === "win32") {
      await execFileAsync("taskmgr.exe", [], { windowsHide: true });
      return;
    }
    if (p === "darwin") {
      await execFileAsync("open", ["-a", "Activity Monitor"]);
      return;
    }
    await execFileAsync("gnome-system-monitor", [], { shell: true });
  },
  wordpad: async () => {
    const p = process.platform;
    if (p === "win32") {
      await execFileAsync("wordpad.exe", [], { windowsHide: true });
      return;
    }
    if (p === "darwin") {
      await execFileAsync("open", ["-a", "TextEdit"]);
      return;
    }
    await execFileAsync("gedit", [], { shell: true });
  },
  /** Microsoft Word (not WordPad). Windows: `start winword`; macOS: app bundle. */
  winword: async () => {
    const p = process.platform;
    if (p === "win32") {
      await winStart("winword");
      return;
    }
    if (p === "darwin") {
      await darwinOpenApp("Microsoft Word");
      return;
    }
    throw new Error("microsoft_word_unsupported_platform");
  },
  mspaint: async () => {
    const p = process.platform;
    if (p === "win32") {
      await execFileAsync("mspaint.exe", [], { windowsHide: true });
      return;
    }
    if (p === "darwin") {
      // No first-party paint app; Preview is the closest built-in viewer/editor.
      await execFileAsync("open", ["-a", "Preview"]);
      return;
    }
    await execFileAsync("gnome-paint", [], { shell: true });
  },
  photos: async () => {
    const p = process.platform;
    if (p === "win32") {
      await openExternalSafe("ms-photos:");
      return;
    }
    if (p === "darwin") {
      await darwinOpenApp("Photos");
      return;
    }
    try {
      await execFileAsync("eog", [], { shell: true });
    } catch {
      await execFileAsync("gthumb", [], { shell: true });
    }
  },
};

const LABELS = {
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
  task_manager: "Task Manager",
  wordpad: "WordPad",
  winword: "Microsoft Word",
  mspaint: "Paint",
  photos: "Photos",
};

function isKnownApplicationKey(k) {
  return typeof k === "string" && Object.prototype.hasOwnProperty.call(LAUNCHERS, k);
}

function getApplicationLabel(k) {
  if (typeof k !== "string") return "";
  return LABELS[k] ?? k;
}

module.exports = {
  launchKnownApplication,
  isKnownApplicationKey,
  getApplicationLabel,
  /** @type {readonly string[]} */
  knownApplicationKeys: Object.freeze(Object.keys(LAUNCHERS).sort()),
};
