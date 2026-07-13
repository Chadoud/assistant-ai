/**
 * OS-level mouse input for the desktop connect autopilot (Windows).
 *
 * Moves the real cursor and clicks via Win32 (`SetCursorPos` + `mouse_event`) through
 * a short PowerShell shim. The process is made DPI-aware first so coordinates match
 * the physical-pixel screenshot the backend captured with `mss`.
 *
 * Only Windows is implemented; other platforms throw so the caller can fall back.
 */

const { execFile } = require("child_process");

const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;

function isSupported() {
  return process.platform === "win32";
}

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: 8000 },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

/**
 * Move the cursor to (x, y) in physical screen pixels and left-click.
 * @param {number} x
 * @param {number} y
 */
async function clickAt(x, y) {
  if (!isSupported()) throw new Error("desktop input not supported on this platform");
  const px = Math.round(x);
  const py = Math.round(y);
  const script = [
    "Add-Type @\"",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public class NativeInput {",
    "  [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y);",
    "  [DllImport(\"user32.dll\")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, int e);",
    "  [DllImport(\"user32.dll\")] public static extern bool SetProcessDPIAware();",
    "}",
    "\"@",
    "[NativeInput]::SetProcessDPIAware() | Out-Null",
    `[NativeInput]::SetCursorPos(${px}, ${py}) | Out-Null`,
    "Start-Sleep -Milliseconds 80",
    `[NativeInput]::mouse_event(${MOUSEEVENTF_LEFTDOWN}, 0, 0, 0, 0)`,
    "Start-Sleep -Milliseconds 30",
    `[NativeInput]::mouse_event(${MOUSEEVENTF_LEFTUP}, 0, 0, 0, 0)`,
  ].join("\n");
  await runPowerShell(script);
}

module.exports = { isSupported, clickAt };
