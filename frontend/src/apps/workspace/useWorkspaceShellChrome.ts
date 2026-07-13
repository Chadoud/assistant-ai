import { useEffect, useState } from "react";

/** Below 1024px the primary nav collapses to icons-only so content stays usable. */
export function useSidebarCompactLayout() {
  const [sidebarCompact, setSidebarCompact] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 1023px)").matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const onChange = () => setSidebarCompact(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return sidebarCompact;
}

/** Global ⌘⇧K / Ctrl+Shift+K opens brain search. */
export function useBrainSearchShortcut() {
  const [brainSearchOpen, setBrainSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBrainSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { brainSearchOpen, setBrainSearchOpen };
}
