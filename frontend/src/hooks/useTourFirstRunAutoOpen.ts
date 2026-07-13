/**
 * Previously auto-opened the product tour on first launch.
 * v2: users start the tour from Sort files → Guided tour or Help.
 */
export function useTourFirstRunAutoOpen(_opts: {
  hydrated: boolean;
  showWelcome: boolean;
  needsCloudAccount: boolean;
  launchSphereSplashOpen: boolean;
  isDesktopManaged: boolean;
  backendOnline: boolean;
  setTourStep: (value: number | ((prev: number) => number)) => void;
  setTourOpen: (value: boolean) => void;
}): void {
  /* manual entry only */
}
