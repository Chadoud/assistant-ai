/** True when the renderer runs inside the packaged/dev Electron shell (not plain browser). */
export function hasEntitlementIpc(): boolean {
  return typeof window.electronAPI?.getEntitlementState === "function";
}

/** Packaged/dev Electron renderer (preload exposes electronAPI). */
export function isElectronRenderer(): boolean {
  return typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent);
}
