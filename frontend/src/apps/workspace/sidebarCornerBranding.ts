/**
 * Nav-rail top corner (logo + clock) on desktop Electron custom chrome.
 * Hidden only during the AI Manager intro landing on the Exo tab.
 */
export function shouldShowSidebarCornerBranding(
  tab: string,
  exoChromeRevealed: boolean,
  options: { isDesktopElectron: boolean },
): boolean {
  if (!options.isDesktopElectron) return false;
  return tab !== "exo" || exoChromeRevealed;
}
