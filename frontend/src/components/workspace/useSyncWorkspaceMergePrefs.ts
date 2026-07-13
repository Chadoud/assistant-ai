import { useEffect } from "react";

/**
 * Keeps parent merge prefs in sync with local filter state — same contract as the repeated
 * `useEffect(() => onMergePrefsChange(mergePayload()), [onMergePrefsChange, mergePayload])` blocks.
 */
export function useSyncWorkspaceMergePrefs<T>(
  onMergePrefsChange: (prefs: T | null) => void,
  mergePayload: () => T | null
): void {
  useEffect(() => {
    onMergePrefsChange(mergePayload());
  }, [onMergePrefsChange, mergePayload]);
}
