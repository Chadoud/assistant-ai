import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import type { ModelStorageResponse } from "../api";
import { OLLAMA_STORAGE_REFRESH_EVENT } from "../constants";
import { inlineErrorMessage } from "../utils/userGuidance";

export function useOllamaStorage(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const [data, setData] = useState<ModelStorageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pruning, setPruning] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.getModelStorage();
      setData(r);
    } catch (e: unknown) {
      setError(inlineErrorMessage(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    const onRefresh = () => void refresh();
    window.addEventListener(OLLAMA_STORAGE_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(OLLAMA_STORAGE_REFRESH_EVENT, onRefresh);
  }, [refresh]);

  const deleteGroup = useCallback(
    async (digestPrefix: string) => {
      setDeletingId(digestPrefix);
      try {
        await api.deletePartialBlobs(digestPrefix);
        await refresh();
      } catch (e: unknown) {
        setError(inlineErrorMessage(e));
      } finally {
        setDeletingId(null);
      }
    },
    [refresh]
  );

  const prune = useCallback(async () => {
    setPruning(true);
    setError(null);
    try {
      const r = await api.ollamaPrune();
      if (!r.ok) setError(r.message);
      await refresh();
    } catch (e: unknown) {
      setError(inlineErrorMessage(e));
    } finally {
      setPruning(false);
    }
  }, [refresh]);

  return {
    data,
    loading,
    error,
    refresh,
    deleteGroup,
    deletingId,
    prune,
    pruning,
    setError,
  };
}
