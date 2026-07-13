import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import { api } from "../api";
import type { EntitlementStatus } from "../api";
import type { OCRCapabilities } from "../types/electron";
import { normalizeModel } from "../utils/modelCatalogue";
import { inlineErrorMessage, toastUserError } from "../utils/userGuidance";
import { OLLAMA_STORAGE_REFRESH_EVENT } from "../constants";
import { useCloudSortActive } from "./useCloudSortActive";
import { useI18n } from "../i18n/I18nContext";

type QueuedInstall = {
  model: string;
  onSuccess?: (updatedModels: string[]) => void;
};

export interface UseModelsReturn {
  models: string[];
  loadingModels: boolean;
  installingModel: boolean;
  /** Model name being pulled (for global UI when Settings is not mounted). */
  installingModelName: string | null;
  /** Additional models waiting to download after the current pull (Ollama runs one pull at a time). */
  installQueueCount: number;
  /** 0–100 download percentage; -1 = indeterminate (e.g. pulling manifest) */
  installProgress: number;
  installPhase: string;
  installMessage: string | null;
  setInstallMessage: Dispatch<SetStateAction<string | null>>;
  /** Name of the model currently being deleted, or null */
  deletingModel: string | null;
  systemRamGb: number | null;
  ocrInfo: OCRCapabilities | null;
  refreshModels: (opts?: { silent?: boolean }) => Promise<void>;
  installModel: (model: string, onSuccess?: (updatedModels: string[]) => void) => Promise<void>;
  cancelInstall: () => void;
  deleteModel: (model: string) => Promise<void>;
}

interface UseModelsOptions {
  /**
   * Backend health from {@link useBackendHealth}. The first model fetch waits for
   * the backend to come online, and retries when it does — so the startup race
   * (renderer mounts before the local API is reachable) no longer surfaces a
   * scary "Could not load AI models / cannot reach the API" toast. Pass `undefined`
   * to load immediately (legacy behaviour).
   */
  backendOnline?: boolean;
  /** Suppress model-load toasts while startup health probes are still running. */
  suppressErrorsWhileProbing?: boolean;
  /** Welcome wizard — failures show inline cards, not Sonner toasts. */
  suppressErrorToasts?: boolean;
  /** Cloud entitlement — detects Exo-managed sort without env override lag. */
  entitlement?: EntitlementStatus | null;
}

export function useModels(options?: UseModelsOptions) {
  const { t } = useI18n();
  const { cloudSortActive } = useCloudSortActive(options?.entitlement);
  const backendOnline = options?.backendOnline;
  const suppressErrorsWhileProbing = options?.suppressErrorsWhileProbing;
  const suppressErrorToasts = options?.suppressErrorToasts;
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [installingModel, setInstallingModel] = useState(false);
  const [installingModelName, setInstallingModelName] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState(-1);
  const [installPhase, setInstallPhase] = useState("");
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);
  const [systemRamGb, setSystemRamGb] = useState<number | null>(null);
  const [ocrInfo, setOcrInfo] = useState<OCRCapabilities | null>(null);
  const installAbortRef = useRef<AbortController | null>(null);
  const installQueueRef = useRef<QueuedInstall[]>([]);
  const processingInstallQueueRef = useRef(false);
  const [installQueueCount, setInstallQueueCount] = useState(0);

  const syncQueueCount = () => setInstallQueueCount(installQueueRef.current.length);

  const loadModels = useCallback(async (opts?: { silent?: boolean }) => {
    setLoadingModels(true);
    try {
      const r = await api.models();
      setModels(r.models);
    } catch (e) {
      setModels([]);
      const quiet = opts?.silent || suppressErrorsWhileProbing || suppressErrorToasts;
      if (!quiet) toastUserError("Could not load Sorting LLM settings", e);
    } finally {
      setLoadingModels(false);
    }
  }, [suppressErrorsWhileProbing, suppressErrorToasts]);

  useEffect(() => {
    // Wait for the backend before the first fetch; retry when it comes online.
    if (backendOnline === false) return;
    void loadModels({ silent: suppressErrorsWhileProbing });
  }, [backendOnline, suppressErrorsWhileProbing, loadModels]);

  useEffect(() => {
    void (async () => {
      try {
        const specs = await window.electronAPI?.getSystemSpecs?.();
        if (specs?.totalMemGb) setSystemRamGb(specs.totalMemGb);
      } catch {
        /* optional Electron capability */
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const caps = await window.electronAPI?.getOCRCapabilities?.();
        if (caps) setOcrInfo(caps);
      } catch {
        /* optional Electron capability */
      }
    })();
  }, []);

  const refreshModels = useCallback(
    (opts?: { silent?: boolean }) => loadModels(opts),
    [loadModels]
  );

  const cancelInstall = () => {
    installAbortRef.current?.abort();
    installQueueRef.current = [];
    syncQueueCount();
  };

  const sameModelName = (a: string, b: string) => normalizeModel(a) === normalizeModel(b);

  const processInstallQueue = async () => {
    if (processingInstallQueueRef.current) return;
    processingInstallQueueRef.current = true;
    try {
      while (installQueueRef.current.length > 0) {
        const { model: trimmed, onSuccess } = installQueueRef.current.shift()!;
        syncQueueCount();

        const controller = new AbortController();
        installAbortRef.current = controller;
        setInstallingModel(true);
        setInstallingModelName(trimmed);
        setInstallProgress(-1);
        setInstallPhase("Connecting…");
        if (installQueueRef.current.length > 0) {
          setInstallMessage(
            `Downloading ${trimmed}… (${installQueueRef.current.length} more queued — Ollama pulls one model at a time)`
          );
        } else {
          setInstallMessage(null);
        }
        try {
          const r = await api.pullModel(
            trimmed,
            (pct, status) => {
              setInstallProgress(pct);
              setInstallPhase(status);
            },
            controller.signal
          );
          setInstallProgress(100);
          setInstallPhase("Done");
          setModels(r.models);
          onSuccess?.(r.models);
          setInstallMessage(`Model ready: ${trimmed}`);
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") {
            setInstallMessage(
              "Download cancelled. Leftover cache may stay on disk — open Settings → Sorting LLM → Download new model; incomplete layers appear under the sort or vision section."
            );
            try {
              window.dispatchEvent(new CustomEvent(OLLAMA_STORAGE_REFRESH_EVENT));
            } catch {
              /* ignore */
            }
            installQueueRef.current = [];
            syncQueueCount();
            break;
          }
          setInstallMessage(`Failed to download ${trimmed}: ${inlineErrorMessage(e)}`);
        } finally {
          installAbortRef.current = null;
          setInstallProgress(-1);
          setInstallPhase("");
        }
      }
    } finally {
      processingInstallQueueRef.current = false;
      setInstallingModel(false);
      setInstallingModelName(null);
      setInstallProgress(-1);
      setInstallPhase("");
      syncQueueCount();
      if (installQueueRef.current.length > 0) {
        void processInstallQueue();
      }
    }
  };

  const installModel = async (
    model: string,
    onSuccess?: (updatedModels: string[]) => void
  ) => {
    if (cloudSortActive) {
      setInstallMessage(t("remoteLlm.downloadDisabled"));
      return;
    }
    const trimmed = model.trim();
    if (!trimmed) return;

    const queuedNames = installQueueRef.current.map((q) => q.model);
    if (queuedNames.some((n) => sameModelName(n, trimmed))) {
      setInstallMessage(`Already queued: ${trimmed}`);
      return;
    }
    if (installingModelName && sameModelName(installingModelName, trimmed)) {
      setInstallMessage(`Already downloading: ${trimmed}`);
      return;
    }
    if (models.some((m) => sameModelName(m, trimmed))) {
      setInstallMessage(`Already installed: ${trimmed}`);
      return;
    }

    installQueueRef.current.push({ model: trimmed, onSuccess });
    syncQueueCount();
    if (installQueueRef.current.length > 1) {
      setInstallMessage(
        `Queued: ${trimmed} (${installQueueRef.current.length - 1} ahead in queue — pulls run one at a time)`
      );
    }
    await processInstallQueue();
  };

  const deleteModel = async (model: string) => {
    if (cloudSortActive) {
      setInstallMessage(t("remoteLlm.downloadDisabled"));
      return;
    }
    setDeletingModel(model);
    try {
      const r = await api.deleteModel(model);
      setModels(r.models);
    } catch (e) {
      setInstallMessage(`Failed to delete: ${inlineErrorMessage(e)}`);
    } finally {
      setDeletingModel(null);
    }
  };

  return {
    models,
    loadingModels,
    installingModel,
    installingModelName,
    installQueueCount,
    installProgress,
    installPhase,
    installMessage,
    setInstallMessage,
    deletingModel,
    systemRamGb,
    ocrInfo,
    refreshModels,
    installModel,
    cancelInstall,
    deleteModel,
  };
}
