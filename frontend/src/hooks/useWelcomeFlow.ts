import { useState, useEffect, useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type { AppSettings } from "../types/settings";
import { WELCOME_SETUP_DISMISSED_STORAGE_KEY } from "../constants";
import { isSortSetupComplete, isWelcomeSetupComplete } from "../utils/setupReadiness";
import type { MainNavTab } from "./useMainNavItems";
import type { EntitlementStatus } from "../api";
import { useCloudSortActive } from "./useCloudSortActive";

type Tab = MainNavTab;

/**
 * Welcome wizard visibility, launch splash, and dismiss path.
 * Keeps localStorage / sessionStorage behavior identical to the former App inline logic.
 */
export function useWelcomeFlow(opts: {
  hydrated: boolean;
  entitlementLoaded: boolean;
  needsCloudAccount: boolean;
  settings: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  setTab: Dispatch<SetStateAction<Tab>>;
  entitlement?: EntitlementStatus | null;
}) {
  const { hydrated, entitlementLoaded, needsCloudAccount, settings, setSettings, setTab, entitlement } =
    opts;
  const { cloudSortActive } = useCloudSortActive(entitlement);
  const setupOptions = useMemo(
    () => ({ remoteSortLlm: cloudSortActive }),
    [cloudSortActive],
  );

  const [welcomeSetupSkipped, setWelcomeSetupSkipped] = useState(() => {
    try {
      return localStorage.getItem(WELCOME_SETUP_DISMISSED_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const welcomeSetupComplete = isWelcomeSetupComplete(settings, setupOptions);
  const sortSetupComplete = isSortSetupComplete(settings, setupOptions);
  const [welcomeWizardLatch, setWelcomeWizardLatch] = useState(false);

  useEffect(() => {
    if (!hydrated || !entitlementLoaded || needsCloudAccount || welcomeSetupSkipped) return;
    try {
      if (sessionStorage.getItem("__exositesDevScenario") === "e2e") return;
    } catch {
      /* ignore */
    }
    if (!welcomeSetupComplete) setWelcomeWizardLatch(true);
  }, [hydrated, entitlementLoaded, needsCloudAccount, welcomeSetupSkipped, welcomeSetupComplete]);

  const showWelcome =
    hydrated &&
    entitlementLoaded &&
    !needsCloudAccount &&
    !welcomeSetupSkipped &&
    (!welcomeSetupComplete || welcomeWizardLatch);

  /** Open without the welcome Tesseract splash — land straight on the main workspace (AI Manager). */
  const [launchSphereSplashOpen, setLaunchSphereSplashOpen] = useState(() => false);
  /** Do not gate on `hydrated` — otherwise the main UI paints for a frame before the fixed overlay mounts. */
  const showLaunchSphereSplash =
    launchSphereSplashOpen &&
    entitlementLoaded &&
    !needsCloudAccount &&
    (!hydrated || !showWelcome);

  const finishLaunchSphereSplash = useCallback(() => {
    setLaunchSphereSplashOpen(false);
  }, []);

  const dismissWelcomeWizard = useCallback(async () => {
    setWelcomeWizardLatch(false);
    let outputDir = settings.outputDir.trim();
    if (!outputDir) {
      try {
        const dir = await window.electronAPI?.getDefaultOutputDir?.();
        if (dir) {
          outputDir = dir.trim();
          setSettings((s) => ({ ...s, outputDir: dir }));
        }
      } catch {
        /* ignore */
      }
    }
    setLaunchSphereSplashOpen(false);
    const effectiveSettings =
      outputDir !== settings.outputDir.trim() ? { ...settings, outputDir } : settings;
    if (!isWelcomeSetupComplete(effectiveSettings, setupOptions)) {
      try {
        localStorage.setItem(WELCOME_SETUP_DISMISSED_STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
      setWelcomeSetupSkipped(true);
    }
    setTab("exo");
  }, [settings, setSettings, setTab, setupOptions]);

  useEffect(() => {
    if (!hydrated) return;
    if (!welcomeSetupComplete) return;
    try {
      localStorage.removeItem(WELCOME_SETUP_DISMISSED_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setWelcomeSetupSkipped(false);
  }, [hydrated, welcomeSetupComplete]);

  /** Re-open the wizard after a skip (the "Finish setup" callout action). */
  const reopenWelcomeWizard = useCallback(() => {
    try {
      localStorage.removeItem(WELCOME_SETUP_DISMISSED_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setWelcomeSetupSkipped(false);
    setWelcomeWizardLatch(true);
  }, [setWelcomeSetupSkipped]);

  /**
   * Skipped setup with no working sort model — the app cannot deliver its core
   * value yet, so the workspace shows a persistent "Finish setup" callout.
   */
  const setupIncomplete =
    hydrated && entitlementLoaded && !needsCloudAccount && !showWelcome && !sortSetupComplete;

  return {
    showWelcome,
    showLaunchSphereSplash,
    launchSphereSplashOpen,
    finishLaunchSphereSplash,
    dismissWelcomeWizard,
    reopenWelcomeWizard,
    setupIncomplete,
  };
}
