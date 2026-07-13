import { useState, useEffect } from "react";
import { SETTINGS_STORAGE_KEY } from "../constants";
import type { AppSettings } from "../types/settings";
import { defaultSortOutputPathForBackend } from "../utils/defaultOutputPath";
import {
  DEFAULT_APP_SETTINGS,
  mergeAppSettings,
} from "../settings/appSettingsHydration";
import {
  hydrateSecretsFromSafeStorage,
  persistProviderSecretsToSafeStorage,
} from "../settings/secretsStorage";
import { stripSecretsForStorage } from "../settings/settingsPersist";
import { trackSetupMilestone } from "../telemetry/setupTelemetry";
import { markPendingOutputFolderSortTabToast } from "../utils/outputFolderToast";

export { DEFAULT_APP_SETTINGS };

/** Survives React Strict Mode remounts — avoids double default-output toast / setState in dev. */
let defaultOutputSeedStarted = false;

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage on mount; merge safeStorage secrets when Electron provides them.
  useEffect(() => {
    void (async () => {
      try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        let merged = DEFAULT_APP_SETTINGS;
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<AppSettings> & { ocrLanguage?: string };
          merged = mergeAppSettings(parsed, DEFAULT_APP_SETTINGS);
        }
        const secrets = await hydrateSecretsFromSafeStorage();
        setSettings((prev) => mergeAppSettings({ ...merged, ...secrets }, prev));
      } catch {
        /* ignore malformed local settings */
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // Persist non-secret fields to localStorage; mirror API keys to safeStorage only.
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(stripSecretsForStorage(settings)));
    void persistProviderSecretsToSafeStorage(settings);
  }, [settings, hydrated]);

  // Auto-create default output dir if none is set (Electron) or set the same path string for the local API (browser).
  useEffect(() => {
    if (!hydrated) return;
    if (settings.outputDir.trim()) return;
    if (defaultOutputSeedStarted) return;
    /* Dev `first-run` / `welcome` scenario: keep output empty so the setup wizard still shows. */
    if (import.meta.env.DEV) {
      try {
        const sc = sessionStorage.getItem("__exositesDevScenario");
        if (sc === "first-run" || sc === "welcome" || sc === "skipped") return;
      } catch {
        /* ignore */
      }
    }
    defaultOutputSeedStarted = true;

    void (async () => {
      const fromElectron = await window.electronAPI?.getDefaultOutputDir?.();
      if (fromElectron?.trim()) {
        const dir = fromElectron.trim();
        setSettings((prev) => ({ ...prev, outputDir: dir }));
        markPendingOutputFolderSortTabToast(dir);
        return;
      }
      const fallback = defaultSortOutputPathForBackend();
      setSettings((prev) => ({ ...prev, outputDir: fallback }));
      markPendingOutputFolderSortTabToast(fallback);
    })();
  }, [hydrated, settings.outputDir]);

  useEffect(() => {
    if (!hydrated || !settings.outputDir.trim() || !settings.telemetryOptIn) return;
    trackSetupMilestone(settings.telemetryOptIn, settings.uiLocale, "output_folder_set");
  }, [hydrated, settings.outputDir, settings.telemetryOptIn, settings.uiLocale]);

  return {
    settings,
    setSettings,
    hydrated,
  };
}
