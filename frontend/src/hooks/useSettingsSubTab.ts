import { useCallback, useState } from "react";
import { loadSettingsNavTab, persistSettingsNavTab, type SettingsNavTab } from "../utils/settingsNav";

/**
 * Settings category (File sorting / AI agents / …) — synced with sidebar and sessionStorage.
 * `showAllSections` is true when the user opens the top-level Settings nav item (full scrollable page).
 */
export function useSettingsSubTab() {
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsNavTab>(loadSettingsNavTab);
  const [settingsShowAllSections, setSettingsShowAllSections] = useState(false);

  const selectSettingsSubTab = useCallback((tab: SettingsNavTab) => {
    setSettingsShowAllSections(false);
    setSettingsSubTab(tab);
    persistSettingsNavTab(tab);
  }, []);

  const selectSettingsAllSections = useCallback(() => {
    setSettingsShowAllSections(true);
  }, []);

  return {
    settingsSubTab,
    settingsShowAllSections,
    selectSettingsSubTab,
    selectSettingsAllSections,
  };
};
