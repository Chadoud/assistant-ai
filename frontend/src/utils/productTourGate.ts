import { TOUR_COMPLETED_STORAGE_KEY } from "../constants";

/** Whether the user has finished or skipped the product tour at least once. */
export function readProductTourCompleted(): boolean {
  try {
    return localStorage.getItem(TOUR_COMPLETED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * True while the first-run tour must not auto-open yet (welcome, splash, or local service boot).
 */
export function shouldDeferProductTourAutoOpen(opts: {
  showWelcome: boolean;
  needsCloudAccount: boolean;
  launchSphereSplashOpen: boolean;
  isDesktopManaged: boolean;
  backendOnline: boolean;
}): boolean {
  if (opts.showWelcome || opts.needsCloudAccount || opts.launchSphereSplashOpen) return true;
  // Packaged desktop: wait until PyInstaller backend is up — avoids tour over "Starting Exo…".
  if (opts.isDesktopManaged && !opts.backendOnline) return true;
  return false;
}

/**
 * True while the product tour overlay is open — defer auto-prompts (e.g. assistant actions)
 * so they do not stack on top of the tour.
 */
export function isFirstRunProductTourPending(opts: {
  hydrated: boolean;
  showWelcome: boolean;
  needsCloudAccount: boolean;
  launchSphereSplashOpen: boolean;
  tourOpen: boolean;
}): boolean {
  return opts.tourOpen;
}
