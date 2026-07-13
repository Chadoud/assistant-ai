import { useEffect } from "react";
import { getActiveCodegenSessionId } from "../../features/codegen/codegenStore";
import type { MainNavTab } from "../../hooks/useMainNavItems";

type Tab = MainNavTab;

/** Detach native codegen preview overlay when leaving Exo/Assistant tabs. */
export function useCodegenPreviewDetach(activeTab: Tab) {
  useEffect(() => {
    if (activeTab === "exo" || activeTab === "assistant") return;
    const sessionId = getActiveCodegenSessionId();
    if (sessionId) void window.electronAPI?.codegenPreviewHide?.({ sessionId });
  }, [activeTab]);
}
