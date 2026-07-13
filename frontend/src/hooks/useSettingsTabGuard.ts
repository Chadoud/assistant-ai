import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings } from "../types/settings";
import type { MainNavTab } from "./useMainNavItems";

type Tab = MainNavTab;

/**
 * Unsaved-settings confirmation when leaving Settings and deferred tab navigation.
 */
export function useSettingsTabGuard(options: {
  tab: Tab;
  setTab: React.Dispatch<React.SetStateAction<Tab>>;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  refreshTree: () => void | Promise<void>;
}): {
  settingsUnsavedOpen: boolean;
  setSettingsUnsavedOpen: React.Dispatch<React.SetStateAction<boolean>>;
  requestTab: (next: Tab) => void;
  cancelSettingsNavigation: () => void;
  confirmSettingsDiscard: () => void;
  confirmSettingsKeep: () => void;
} {
  const { tab, setTab, settings, setSettings, refreshTree } = options;
  const settingsBaselineRef = useRef<AppSettings | null>(null);
  const prevTabRef = useRef<Tab>("exo");
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [settingsUnsavedOpen, setSettingsUnsavedOpen] = useState(false);

  useEffect(() => {
    const prev = prevTabRef.current;
    if (tab === "settings" && prev !== "settings") {
      settingsBaselineRef.current = structuredClone(settings);
    }
    prevTabRef.current = tab;
  }, [tab, settings]);

  const requestTab = useCallback(
    (next: Tab) => {
      if (tab === "settings" && next !== "settings") {
        const baseline = settingsBaselineRef.current;
        const dirty =
          baseline !== null && JSON.stringify(settings) !== JSON.stringify(baseline);
        if (dirty) {
          setPendingTab(next);
          setSettingsUnsavedOpen(true);
          return;
        }
      }
      setTab(next);
      if (next === "overview") void refreshTree();
    },
    [tab, settings, setTab, refreshTree]
  );

  const cancelSettingsNavigation = useCallback(() => {
    setSettingsUnsavedOpen(false);
    setPendingTab(null);
  }, []);

  const confirmSettingsDiscard = useCallback(() => {
    if (settingsBaselineRef.current) {
      setSettings(settingsBaselineRef.current);
    }
    if (pendingTab !== null) {
      setTab(pendingTab);
      if (pendingTab === "overview") void refreshTree();
    }
    setSettingsUnsavedOpen(false);
    setPendingTab(null);
  }, [pendingTab, setSettings, setTab, refreshTree]);

  const confirmSettingsKeep = useCallback(() => {
    if (pendingTab !== null) {
      setTab(pendingTab);
      if (pendingTab === "overview") void refreshTree();
    }
    setSettingsUnsavedOpen(false);
    setPendingTab(null);
  }, [pendingTab, setTab, refreshTree]);

  return {
    settingsUnsavedOpen,
    setSettingsUnsavedOpen,
    requestTab,
    cancelSettingsNavigation,
    confirmSettingsDiscard,
    confirmSettingsKeep,
  };
}
