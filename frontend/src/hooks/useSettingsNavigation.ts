import { useCallback, useRef } from "react";
import { SETTINGS_SHOW_ALL_SECTIONS_EVENT } from "../constants";
import type { MainNavTab } from "./useMainNavItems";
import {
  openPrimarySettingsSection,
  persistSettingsNavTab,
  settingsNavTabForEntryId,
  type PrimarySettingsSectionKey,
  type SettingsNavTab,
} from "../utils/settingsNav";

const SETTINGS_SCROLL_RETRY_MS = 50;
const SETTINGS_SCROLL_MAX_ATTEMPTS = 24;

/**
 * Settings tab switches + deep scroll with sub-tab sync and mount-safe retries.
 */
export function useSettingsNavigation(requestTab: (tab: MainNavTab) => void) {
  const scrollToRef = useRef<(sectionId: string) => void>(() => {});
  const scrollReadyRef = useRef(false);
  const pendingScrollIdRef = useRef<string | null>(null);
  const scrollRetryTimerRef = useRef<number | null>(null);
  const selectSubTabRef = useRef<(tab: SettingsNavTab) => void>((tab) => persistSettingsNavTab(tab));

  const clearScrollRetry = useCallback(() => {
    if (scrollRetryTimerRef.current !== null) {
      window.clearInterval(scrollRetryTimerRef.current);
      scrollRetryTimerRef.current = null;
    }
  }, []);

  const flushPendingScroll = useCallback(() => {
    const sectionId = pendingScrollIdRef.current;
    if (!sectionId || !scrollReadyRef.current) return;
    pendingScrollIdRef.current = null;
    clearScrollRetry();
    scrollToRef.current(sectionId);
  }, [clearScrollRetry]);

  const scheduleScrollRetry = useCallback(() => {
    clearScrollRetry();
    let attempts = 0;
    scrollRetryTimerRef.current = window.setInterval(() => {
      attempts += 1;
      if (scrollReadyRef.current && pendingScrollIdRef.current) {
        flushPendingScroll();
        return;
      }
      if (attempts >= SETTINGS_SCROLL_MAX_ATTEMPTS) {
        clearScrollRetry();
        pendingScrollIdRef.current = null;
      }
    }, SETTINGS_SCROLL_RETRY_MS);
  }, [clearScrollRetry, flushPendingScroll]);

  const registerSettingsSubTabSelector = useCallback((select: (tab: SettingsNavTab) => void) => {
    selectSubTabRef.current = select;
  }, []);

  const registerSettingsScroll = useCallback(
    (scrollTo: (sectionId: string) => void, ready: boolean) => {
      scrollToRef.current = scrollTo;
      scrollReadyRef.current = ready;
      if (ready) flushPendingScroll();
    },
    [flushPendingScroll]
  );

  const syncSettingsSubTab = useCallback((sectionId: string) => {
    const tab = settingsNavTabForEntryId(sectionId);
    if (tab) selectSubTabRef.current(tab);
  }, []);

  const jumpToSettingsSection = useCallback(
    (sectionId: string) => {
      syncSettingsSubTab(sectionId);
      requestTab("settings");
      if (scrollReadyRef.current) {
        scrollToRef.current(sectionId);
        return;
      }
      pendingScrollIdRef.current = sectionId;
      scheduleScrollRetry();
    },
    [requestTab, scheduleScrollRetry, syncSettingsSubTab]
  );

  const openPrimarySettings = useCallback(
    (section: PrimarySettingsSectionKey) => {
      openPrimarySettingsSection(jumpToSettingsSection, { section });
    },
    [jumpToSettingsSection]
  );

  const openSettingsHome = useCallback(() => {
    window.dispatchEvent(new CustomEvent(SETTINGS_SHOW_ALL_SECTIONS_EVENT));
    requestTab("settings");
  }, [requestTab]);

  return {
    registerSettingsScroll,
    registerSettingsSubTabSelector,
    jumpToSettingsSection,
    openPrimarySettings,
    openSettingsHome,
  };
}
