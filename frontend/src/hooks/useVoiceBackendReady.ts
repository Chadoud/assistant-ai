import { useEffect, useState } from "react";
import type { AppSettings } from "../types/settings";
import { ensureVoiceBackendReady } from "../voice/ensureVoiceBackendReady";

/**
 * Mirror Gemini settings into the backend process, then expose voice readiness.
 * Prefer this over raw GET /voice/status — avoids a race where the UI polls before sync finishes.
 */
export function useVoiceBackendReady(
  settings: AppSettings,
  backendOnline: boolean,
  settingsHydrated = true,
): boolean | null {
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (!settingsHydrated || !backendOnline) {
      setReady(settingsHydrated && !backendOnline ? false : null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void ensureVoiceBackendReady(settings, { backendOnline }).then((result) => {
        if (!cancelled) setReady(result.ready);
      });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [settingsHydrated, backendOnline, settings.geminiApiKey, settings.chatProviders?.gemini?.apiKey]);

  return ready;
}
