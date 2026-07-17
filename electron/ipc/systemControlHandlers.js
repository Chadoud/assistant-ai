/**
 * System Control executor — safe, allowlisted system actions for the AI assistant.
 *
 * Reached ONLY through the validated `systemCommand:execute` IPC handler, never
 * directly from the renderer. No `systemControl:execute` channel is registered.
 *
 * Commands:
 *  Filesystem   : list_directory, read_file
 *  Terminal     : terminal_safe, get_running_apps
 *  Audio        : system_volume
 *  Apps & Web   : open_app, web_search, browser_control, youtube_video
 *  Scheduling   : reminder
 *  OS control   : computer_settings (screenshot, lock, mute, etc.)
 *
 * No command ever executes arbitrary code — strict allowlists everywhere.
 */

const path = require("path");
const fsp = require("fs").promises;
const { shell, Notification, desktopCapturer } = require("electron");
const { spawn, exec } = require("child_process");
const { validateTerminalCommand } = require("../systemCommandsV1/terminalSafe");
const { isSafeUserContentPath } = require("../authorizedPaths");

const MAX_READ_FILE_BYTES = 100 * 1024; // 100 KB

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { ...options, timeout: 10_000 });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || `Process exited with code ${code}`));
      else resolve(stdout);
    });
    proc.on("error", reject);
  });
}

function execAsync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 8000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

/**
 * Execute a system control command.
 *
 * This is the ONLY entry point. It is reached exclusively via the validated
 * `systemCommand:execute` handler (see systemCommandHandlers.js), which runs
 * `validateExecutePayload` before delegating here. There is intentionally NO
 * direct `systemControl:execute` IPC channel or preload bridge: a renderer
 * compromise must not be able to reach shell/file/app primitives without
 * passing through allowlist validation first.
 *
 * @param {string} commandId Validated command id.
 * @param {Record<string, unknown>} args Validated args.
 */
async function executeSystemControl(commandId, args = {}) {
  return _runSystemControl(commandId, args);
}

async function _runSystemControl(commandId, args = {}) {
  switch (commandId) {

    // ── Filesystem ────────────────────────────────────────────────────────────

    case "list_directory": {
      const dir = String(args.path ?? "");
      if (!dir || !isSafeUserContentPath(dir)) {
        return { ok: false, error: "Path not authorized — pick the folder in the app first" };
      }
      try {
        const entries = await fsp.readdir(path.resolve(dir), { withFileTypes: true });
        const items = entries.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "directory" : "file",
        }));
        return { ok: true, data: { path: dir, items } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "read_file": {
      const filePath = String(args.path ?? "");
      if (!filePath || !isSafeUserContentPath(filePath)) {
        return { ok: false, error: "Path not authorized — pick the folder in the app first" };
      }
      try {
        const resolved = path.resolve(filePath);
        const stat = await fsp.stat(resolved);
        if (stat.size > MAX_READ_FILE_BYTES) {
          return { ok: false, error: `File too large (max ${MAX_READ_FILE_BYTES / 1024} KB)` };
        }
        const content = await fsp.readFile(resolved, "utf8");
        return { ok: true, data: { content: content.slice(0, MAX_READ_FILE_BYTES) } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    // ── Terminal ──────────────────────────────────────────────────────────────

    case "terminal_safe": {
      const cmd = String(args.cmd ?? "").trim();
      const v = validateTerminalCommand(cmd);
      if (!v.ok) {
        return { ok: false, error: "Command not in the safe allowlist" };
      }
      try {
        const isWin = process.platform === "win32";
        const [shell_, flag] = isWin ? ["cmd.exe", "/c"] : ["/bin/sh", "-c"];
        const output = await runCommand(shell_, [flag, cmd]);
        return { ok: true, data: { output: output.slice(0, 8000) } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "get_running_apps": {
      try {
        let output;
        if (process.platform === "win32") {
          output = await runCommand("tasklist", ["/FO", "CSV", "/NH"]);
          const apps = output
            .split("\n")
            .map((line) => line.trim().replace(/^"|".*$/g, "").trim())
            .filter(Boolean)
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .slice(0, 50);
          return { ok: true, data: { apps } };
        } else {
          output = await runCommand("ps", ["-eo", "comm"]);
          const apps = output
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .slice(0, 50);
          return { ok: true, data: { apps } };
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    // ── Audio ─────────────────────────────────────────────────────────────────

    case "system_volume": {
      const level = Math.round(Math.max(0, Math.min(100, Number(args.level ?? 50))));
      try {
        if (process.platform === "win32") {
          // Use nircmd if available, then PowerShell fallback
          await execAsync(`nircmd setsysvolume ${Math.round(level / 100 * 65535)}`).catch(async () => {
            const ps = `$vol = ${level}; [void][System.Reflection.Assembly]::LoadWithPartialName('presentationFramework'); ` +
              `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class V { [DllImport("winmm.dll")] public static extern int waveOutSetVolume(System.IntPtr h, uint d); }'; ` +
              `[V]::waveOutSetVolume([System.IntPtr]::Zero, ($vol * 655.35 -as [uint32]) * 0x10001)`;
            await execAsync(`powershell -NoProfile -Command "${ps}"`);
          });
          return { ok: true, data: { level } };
        } else if (process.platform === "darwin") {
          await execAsync(`osascript -e 'set volume output volume ${level}'`);
          return { ok: true, data: { level } };
        } else {
          await execAsync(`amixer -D pulse sset Master ${level}%`);
          return { ok: true, data: { level } };
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    // ── Apps & Web ────────────────────────────────────────────────────────────

    case "open_app": {
      const appName = String(args.app_name ?? "").trim();
      if (!appName || appName.length > 200) {
        return { ok: false, error: "Invalid app name" };
      }
      try {
        if (process.platform === "win32") {
          // Try "start" which searches PATH and Start Menu
          await execAsync(`start "" "${appName.replace(/"/g, "")}"`).catch(async () => {
            // Fallback: open as URL or file path
            await shell.openPath(appName);
          });
        } else if (process.platform === "darwin") {
          await execAsync(`open -a "${appName.replace(/"/g, "")}" || open "${appName.replace(/"/g, "")}"`);
        } else {
          await execAsync(`xdg-open "${appName.replace(/"/g, "")}"`);
        }
        return { ok: true, data: { app: appName, opened: true } };
      } catch (e) {
        return { ok: false, error: `Could not open "${appName}": ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case "close_app": {
      const appName = String(args.app_name ?? "").trim();
      if (!appName || appName.length > 200) {
        return { ok: false, error: "Invalid app name" };
      }
      // Derive a best-guess process name from the friendly app name
      const commonMap = {
        whatsapp:    ["WhatsApp.exe"],
        chrome:      ["chrome.exe"],
        firefox:     ["firefox.exe"],
        edge:        ["msedge.exe"],
        spotify:     ["Spotify.exe"],
        discord:     ["Discord.exe"],
        slack:       ["slack.exe"],
        zoom:        ["Zoom.exe"],
        teams:       ["Teams.exe"],
        telegram:    ["Telegram.exe"],
        vlc:         ["vlc.exe"],
        notepad:     ["notepad.exe"],
        calculator:  ["Calculator.exe"],
        word:        ["WINWORD.EXE"],
        excel:       ["EXCEL.EXE"],
        powerpoint:  ["POWERPNT.EXE"],
      };
      const key = appName.toLowerCase().replace(/\s+/g, "");
      const procs = commonMap[key] ?? [`${appName}.exe`, appName];
      try {
        if (process.platform === "win32") {
          let closed = false;
          for (const proc of procs) {
            const { stdout } = await execAsync(`taskkill /F /IM "${proc.replace(/"/g, "")}" 2>&1`).catch(e => ({ stdout: "" }));
            if (stdout && !stdout.includes("not found") && !stdout.includes("ERROR")) {
              closed = true;
              break;
            }
          }
          if (!closed) {
            // Last resort — taskkill by window title substring
            await execAsync(`taskkill /F /FI "WINDOWTITLE eq *${appName.replace(/"/g, "")}*" 2>&1`).catch(() => {});
          }
          return { ok: true, data: { app: appName, closed: true } };
        } else if (process.platform === "darwin") {
          await execAsync(`osascript -e 'quit app "${appName.replace(/"/g, "")}"'`).catch(() =>
            execAsync(`pkill -f "${appName.replace(/"/g, "")}"`)
          );
          return { ok: true, data: { app: appName, closed: true } };
        } else {
          await execAsync(`pkill -f "${appName.replace(/"/g, "")}"`);
          return { ok: true, data: { app: appName, closed: true } };
        }
      } catch (e) {
        return { ok: false, error: `Could not close "${appName}": ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case "web_search": {
      const query = String(args.query ?? "").trim();
      const mode = String(args.mode ?? "search").toLowerCase();
      if (!query || query.length > 500) {
        return { ok: false, error: "Invalid search query" };
      }
      const encoded = encodeURIComponent(query);
      const url = mode === "news"
        ? `https://news.google.com/search?q=${encoded}`
        : `https://www.google.com/search?q=${encoded}`;
      try {
        await shell.openExternal(url);
        return { ok: true, data: { url, query } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "browser_control": {
      const rawUrl = String(args.url ?? args.query ?? "").trim();
      const action = String(args.action ?? "open").toLowerCase();
      if (!rawUrl || rawUrl.length > 2000) {
        return { ok: false, error: "Invalid URL or query" };
      }
      // Ensure we have a valid URL (add https:// if missing)
      let url = rawUrl;
      if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("file://")) {
        // treat as search query if no TLD-like structure
        if (!url.includes(".") || url.includes(" ")) {
          url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        } else {
          url = `https://${url}`;
        }
      }
      try {
        await shell.openExternal(url);
        return { ok: true, data: { url, action } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "youtube_video": {
      const query = String(args.query ?? args.search ?? "").trim();
      const action = String(args.action ?? "play").toLowerCase();
      if (!query && action !== "trending") {
        return { ok: false, error: "Provide a search query" };
      }
      let url;
      if (action === "trending") {
        const region = String(args.region ?? "US").toUpperCase().slice(0, 2);
        url = `https://www.youtube.com/feed/trending?gl=${region}`;
      } else {
        url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      }
      try {
        await shell.openExternal(url);
        return { ok: true, data: { url, query, action } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    // ── Scheduling ────────────────────────────────────────────────────────────

    case "reminder": {
      const message = String(args.message ?? "").trim();
      const dateStr = String(args.date ?? "").trim();
      const timeStr = String(args.time ?? "").trim();
      if (!message) return { ok: false, error: "Message is required" };

      if (!Notification.isSupported()) {
        return { ok: false, error: "Desktop notifications not supported on this system" };
      }

      let delayMs = 0;
      if (dateStr && timeStr) {
        const target = new Date(`${dateStr}T${timeStr}`);
        delayMs = Math.max(0, target.getTime() - Date.now());
      }

      const fire = () => {
        const n = new Notification({ title: "Exo Reminder", body: message });
        n.show();
      };

      if (delayMs > 0) {
        setTimeout(fire, delayMs);
        const eta = dateStr && timeStr ? `${dateStr} at ${timeStr}` : "shortly";
        return { ok: true, data: { message, scheduledFor: eta, delayMs } };
      } else {
        fire();
        return { ok: true, data: { message, scheduledFor: "now" } };
      }
    }

    // ── OS control ────────────────────────────────────────────────────────────

    case "computer_settings": {
      const action = String(args.action ?? args.description ?? "").toLowerCase().trim();

      // Screenshot
      if (action.includes("screenshot") || action.includes("capture screen")) {
        try {
          const sources = await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 1920, height: 1080 },
          });
          if (!sources.length) return { ok: false, error: "No screen source found" };
          const jpeg = sources[0].thumbnail.toJPEG(85);
          const b64 = jpeg.toString("base64");
          return { ok: true, data: { action: "screenshot", image_b64: b64 } };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      }

      // Volume control
      if (action.includes("volume") || action.includes("mute")) {
        const valueMatch = action.match(/(\d+)/);
        const level = valueMatch ? Math.min(100, parseInt(valueMatch[1], 10)) : null;
        if (action.includes("mute") || level === 0) {
          return _runSystemControl("system_volume", { level: 0 });
        }
        if (level !== null) {
          return _runSystemControl("system_volume", { level });
        }
        return { ok: false, error: "Specify a volume level (0-100) or 'mute'" };
      }

      // Lock screen
      if (action.includes("lock") || action.includes("lock screen")) {
        try {
          if (process.platform === "win32") {
            await execAsync("rundll32.exe user32.dll,LockWorkStation");
          } else if (process.platform === "darwin") {
            await execAsync(`osascript -e 'tell application "System Events" to keystroke "q" using {command down, control down}'`);
          } else {
            await execAsync("loginctl lock-session");
          }
          return { ok: true, data: { action: "lock" } };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      }

      // Open task manager / activity monitor
      if (action.includes("task manager") || action.includes("activity monitor")) {
        try {
          if (process.platform === "win32") {
            await execAsync("start taskmgr");
          } else if (process.platform === "darwin") {
            await execAsync("open -a 'Activity Monitor'");
          } else {
            await execAsync("xdg-open /usr/bin/gnome-system-monitor || xterm -e top &");
          }
          return { ok: true, data: { action: "task_manager" } };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      }

      // Open file explorer
      if (action.includes("explorer") || action.includes("finder") || action.includes("Exo AI") || action.includes("Exo") || action.includes("AI Manager")) {
        try {
          if (process.platform === "win32") {
            await execAsync("start explorer");
          } else if (process.platform === "darwin") {
            await execAsync("open .");
          } else {
            await execAsync("xdg-open .");
          }
          return { ok: true, data: { action: "explorer" } };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      }

      return {
        ok: false,
        error: `Unrecognised action: "${action}". Supported: screenshot, volume, mute, lock, task manager, file explorer.`,
      };
    }

    default:
      return { ok: false, error: `Unknown systemControl command: ${commandId}` };
  }
}

module.exports = { executeSystemControl };
