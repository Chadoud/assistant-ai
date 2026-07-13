import { useEffect, useMemo, useRef, useState } from "react";
import { useDocumentPageHidden } from "../hooks/useDocumentPageHidden";
import {
  isExoVisualBudgetDebugEnabled,
  resolveExoVisualBudget,
  shouldSuspendVoiceAnalyser,
  type ExoMotionVoiceStatus,
  type ExoVisualBudgetState,
} from "./exoVisualBudget";

function useWindowFocused(): boolean {
  const [focused, setFocused] = useState(() =>
    typeof document !== "undefined" ? document.hasFocus() : true,
  );

  useEffect(() => {
    const sync = () => setFocused(document.hasFocus());
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
    };
  }, []);

  return focused;
}

export type UseExoVisualBudgetArgs = {
  visuallyHidden: boolean;
  voiceStatus: ExoMotionVoiceStatus;
};

export type UseExoVisualBudgetResult = {
  budget: ExoVisualBudgetState;
  /** True → clear 20 Hz analyser (idle CSS can still run). */
  suspendVoiceAnalyser: boolean;
};

/**
 * Tesseract stays alive while focused + visible; freezes in background / off-tab.
 */
export function useExoVisualBudget({
  visuallyHidden,
  voiceStatus,
}: UseExoVisualBudgetArgs): UseExoVisualBudgetResult {
  const pageHidden = useDocumentPageHidden();
  const windowFocused = useWindowFocused();
  const hidden = visuallyHidden || pageHidden || !windowFocused;

  const budget = useMemo(() => resolveExoVisualBudget({ hidden }), [hidden]);
  const suspendVoiceAnalyser = useMemo(
    () => shouldSuspendVoiceAnalyser({ hidden, voiceStatus }),
    [hidden, voiceStatus],
  );

  const prevRef = useRef<{ budget: ExoVisualBudgetState; suspendVoiceAnalyser: boolean } | null>(
    null,
  );
  useEffect(() => {
    const prev = prevRef.current;
    if (prev && prev.budget === budget && prev.suspendVoiceAnalyser === suspendVoiceAnalyser) {
      return;
    }
    prevRef.current = { budget, suspendVoiceAnalyser };
    if (isExoVisualBudgetDebugEnabled()) {
      // eslint-disable-next-line no-console -- opt-in QA flag
      console.info("[exoVisualBudget]", { budget, suspendVoiceAnalyser, hidden, voiceStatus });
    }
  }, [budget, suspendVoiceAnalyser, hidden, voiceStatus]);

  return { budget, suspendVoiceAnalyser };
}
