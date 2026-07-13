import { useCallback, useEffect, useState } from "react";

/**
 * True when sort/classify LLM calls go to the remote LiteLLM gateway (env overrides only).
 * Prefer {@link useCloudSortActive} when entitlement IPC is available — it also reads
 * `sortServiceMode` / `sortCredentialsManaged` from the account gate.
 */
export function useRemoteLlmMode(): { remote: boolean; loading: boolean } {
  const [remote, setRemote] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.getBackendEnvOverrides) {
      setLoading(false);
      return;
    }
    try {
      const raw = (await api.getBackendEnvOverrides()) as Record<string, unknown>;
      const mode = String(raw.OLLAMA_MODE ?? "").toLowerCase();
      const flag = String(raw.EXOSITES_REMOTE_LLM ?? "");
      setRemote(mode === "remote" || flag === "1" || flag === "true");
    } catch {
      setRemote(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { remote, loading };
}
