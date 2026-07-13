import { useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useI18n } from "../../i18n/I18nContext";
import {
  getActiveCodegenSessionId,
  setRailTab,
  subscribeActiveCodegen,
  useCodegenState,
} from "./codegenStore";

/**
 * Surfaces Codegen Studio pipeline failures as a toast. The preview panel already
 * shows the error inline, but a build can fail while the user is on another tab —
 * the toast makes it noticeable and offers a one-click jump to the details.
 *
 * Mount once where it stays alive across tab switches (e.g. the main workspace).
 */
export function useCodegenErrorToast(): void {
  const { t } = useI18n();
  const activeSessionId = useSyncExternalStore(
    subscribeActiveCodegen,
    getActiveCodegenSessionId,
    getActiveCodegenSessionId
  );
  const state = useCodegenState(activeSessionId);
  /** Last error string we toasted per session — prevents repeats, allows re-toast after retry. */
  const toastedError = useRef<Map<string, string>>(new Map());

  const phase = state?.phase;
  const error = state?.error ?? null;

  useEffect(() => {
    if (!activeSessionId) return;

    if (phase !== "error" || !error) {
      // Leaving the error state (e.g. retry started) re-arms the toast for next failure.
      toastedError.current.delete(activeSessionId);
      return;
    }

    if (toastedError.current.get(activeSessionId) === error) return;
    toastedError.current.set(activeSessionId, error);

    toast.error(t("errors.codegenFailedTitle"), {
      id: `codegen-error:${activeSessionId}`,
      description: error.slice(0, 300),
      duration: 10000,
      action: {
        label: t("errors.viewDetails"),
        onClick: () => setRailTab("preview"),
      },
    });
  }, [activeSessionId, phase, error, t]);
}
