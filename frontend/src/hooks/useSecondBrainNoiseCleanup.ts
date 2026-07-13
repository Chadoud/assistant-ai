import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  cleanupSecondBrainNoise,
  type CleanupSecondBrainNoiseResult,
} from "../api/memory";
import { useI18n } from "../i18n/I18nContext";

type UseSecondBrainNoiseCleanupOptions = {
  onSuccess?: (result: CleanupSecondBrainNoiseResult) => void | Promise<void>;
};

function toastMessage(
  t: (key: string, vars?: Record<string, string | number>) => string,
  result: CleanupSecondBrainNoiseResult,
): string {
  const memories = result.memories.removed ?? 0;
  const tasks = result.tasks.removed ?? 0;
  const total = result.total_removed ?? memories + tasks;
  if (memories > 0 && tasks > 0) {
    return t("cleanup.toastDoneBreakdown", { memories, tasks });
  }
  return t("cleanup.toastDone", { n: total });
}

/**
 * Preview and execute second-brain promotional cleanup (memories + mail tasks).
 */
export function useSecondBrainNoiseCleanup(options: UseSecondBrainNoiseCleanupOptions = {}) {
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preview, setPreview] = useState<CleanupSecondBrainNoiseResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const closeDialog = useCallback(() => {
    if (isRunning) return;
    setDialogOpen(false);
    setPreview(null);
  }, [isRunning]);

  const openDialog = useCallback(async () => {
    setDialogOpen(true);
    setIsPreviewing(true);
    setPreview(null);
    try {
      const result = await cleanupSecondBrainNoise({ dryRun: true });
      setPreview(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("cleanup.toastFailed"));
      setDialogOpen(false);
    } finally {
      setIsPreviewing(false);
    }
  }, [t]);

  const execute = useCallback(async () => {
    setIsRunning(true);
    try {
      const result = await cleanupSecondBrainNoise({ dryRun: false, delete: true });
      await options.onSuccess?.(result);
      toast.success(toastMessage(t, result));
      setDialogOpen(false);
      setPreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("cleanup.toastFailed"));
    } finally {
      setIsRunning(false);
    }
  }, [options, t]);

  return {
    dialogOpen,
    preview,
    isPreviewing,
    isRunning,
    openDialog,
    closeDialog,
    execute,
  };
}
