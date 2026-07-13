import { useCallback, useEffect, useRef, useState } from "react";
import { EXO_INTRO_HOLD_MS, EXO_INTRO_STORAGE_KEY, readExoIntroSessionDone } from "../../constants";

/**
 * First visit to AI Manager this session: full-bleed center only, then shell + Exo chrome slide in together.
 * @param deferIntro When true (e.g. local service still booting), hold the intro until it becomes false.
 */
export function useExoChromeReveal(activeTab: string, deferIntro = false) {
  const [exoChromeRevealed, setExoChromeRevealed] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
      return readExoIntroSessionDone();
    } catch {
      return true;
    }
  });
  const exoIntroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revealExoChrome = useCallback(() => {
    if (exoIntroTimerRef.current) {
      clearTimeout(exoIntroTimerRef.current);
      exoIntroTimerRef.current = null;
    }
    try {
      sessionStorage.setItem(EXO_INTRO_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setExoChromeRevealed(true);
  }, []);

  useEffect(() => {
    if (activeTab !== "exo" || exoChromeRevealed || deferIntro) {
      if (exoIntroTimerRef.current) {
        clearTimeout(exoIntroTimerRef.current);
        exoIntroTimerRef.current = null;
      }
      return;
    }
    exoIntroTimerRef.current = setTimeout(() => {
      exoIntroTimerRef.current = null;
      revealExoChrome();
    }, EXO_INTRO_HOLD_MS);
    return () => {
      if (exoIntroTimerRef.current) {
        clearTimeout(exoIntroTimerRef.current);
        exoIntroTimerRef.current = null;
      }
    };
  }, [activeTab, exoChromeRevealed, deferIntro, revealExoChrome]);

  return { exoChromeRevealed, revealExoChrome };
}
