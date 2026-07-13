/** Platform detection helpers for the Electron/web renderer. */

/** After Google (Gmail + Drive) connect/disconnect in Electron, other External source cards refresh. */
export const EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT = "exosites-google-integration-changed";

export function notifyGoogleIntegrationChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EXOSITES_GOOGLE_INTEGRATION_CHANGED_EVENT));
}

/** True when `preload` exposed `window.electronAPI` (desktop app), not a bare browser tab. */
export function hasElectronBridge(): boolean {
  return typeof window !== "undefined" && typeof window.electronAPI !== "undefined";
}

export function isMacElectronClient(): boolean {
  return (
    /Macintosh|MacIntel/i.test(navigator.userAgent) &&
    /Electron/i.test(navigator.userAgent)
  );
}

/** Windows desktop build — custom title bar shows app mark; macOS uses native traffic lights. */
export function isWindowsElectronClient(): boolean {
  if (!hasElectronBridge() || isMacElectronClient()) return false;
  return /Windows NT|Win64|WOW64|Win32/i.test(navigator.userAgent) || navigator.platform === "Win32";
}

/** Use for shortcut labels (⌘ vs Ctrl) in the renderer. */
export function isApplePlatform(): boolean {
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform) || /Mac OS/.test(navigator.userAgent);
}

export function modShortcutLabel(): string {
  return isApplePlatform() ? "⌘" : "Ctrl";
}
