import { useState, useEffect } from "react";
import { SETTINGS_STORAGE_KEY } from "../constants";
import type { AppSettings } from "../types/settings";
import { defaultSortOutputPathForBackend } from "../utils/defaultOutputPath";
import {
  DEFAULT_APP_SETTINGS,
  mergeAppSettings,
} from "../settings/appSettingsHydration";
import {
  beginVaultSecretsRemount,
  blankProviderSecretSettings,
  getVaultPersistGeneration,
  hydrateSecretsFromSafeStorage,
  persistProviderSecretsToSafeStorage,
} from "../settings/secretsStorage";
import { stripSecretsForStorage } from "../settings/settingsPersist";
import { trackSetupMilestone } from "../telemetry/setupTelemetry";
import { markPendingOutputFolderSortTabToast } from "../utils/outputFolderToast";
import { resetConversationsStore } from "./useConversations";

export { DEFAULT_APP_SETTINGS };

/** Survives React Strict Mode remounts — avoids double default-output toast / setState in dev. */
let defaultOutputSeedStarted = false;

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  /** When true, skip vault writes until remount hydrate finishes (avoids leaking prior keys). */
  const [vaultWritePaused, setVaultWritePaused] = useState(false);

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

  // Per-account vault switch: blank secrets immediately, then rehydrate from the new profile only.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onAccountProfileChanged) return;
    return api.onAccountProfileChanged(() => {
      resetConversationsStore();
      const generation = beginVaultSecretsRemount();
      setVaultWritePaused(true);
      setSettings((prev) => ({ ...prev, ...blankProviderSecretSettings(prev) }));
      void (async () => {
        try {
          const secrets = await hydrateSecretsFromSafeStorage();
          if (generation !== getVaultPersistGeneration()) return;
          setSettings((prev) => {
            const blanked = blankProviderSecretSettings(prev);
            const nextProviders = { ...blanked.chatProviders };
            for (const id of ["gemini", "openai", "anthropic", "custom"] as const) {
              const fromVault = secrets.chatProviders?.[id]?.apiKey;
              if (fromVault) {
                nextProviders[id] = {
                  ...(nextProviders[id] || { model: "" }),
                  apiKey: fromVault,
                };
              }
            }
            return {
              ...prev,
              geminiApiKey: secrets.geminiApiKey || "",
              chatProviders: nextProviders,
            };
          });
        } catch {
          /* ignore */
        } finally {
          if (generation === getVaultPersistGeneration()) {
            setVaultWritePaused(false);
          }
        }
      })();
    });
  }, []);

  // Persist non-secret fields to localStorage; mirror API keys to safeStorage only.
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(stripSecretsForStorage(settings)));
    if (vaultWritePaused) return;
    const generation = getVaultPersistGeneration();
    void persistProviderSecretsToSafeStorage(settings, generation);
  }, [settings, hydrated, vaultWritePaused]);

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
