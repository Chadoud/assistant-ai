import { useCallback, useEffect } from "react";
import type { MainNavTab } from "../../hooks/useMainNavItems";

type Tab = MainNavTab;

/** F11 = fullscreen when AI Manager workspace is visible. */
export function useExoFullscreenShortcut(activeTab: Tab) {
  const toggleFullscreen = useCallback(async () => {
    if (window.electronAPI?.toggleFullscreen) {
      await window.electronAPI.toggleFullscreen();
    } else if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F11" || activeTab !== "exo") return;
      e.preventDefault();
      void toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab, toggleFullscreen]);
}
