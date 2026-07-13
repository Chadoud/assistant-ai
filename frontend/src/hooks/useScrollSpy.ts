import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

function activeSectionTopThresholdPx(scrollPane: HTMLElement): number {
  const h = scrollPane.clientHeight;
  return Math.min(200, Math.max(72, Math.round(h * 0.28)));
}

type UseScrollSpyOptions = {
  enabled?: boolean;
  sectionIds: readonly string[];
  /** Scroll container; omit to use the viewport (e.g. main column). */
  rootRef?: RefObject<HTMLElement | null>;
  scrollSpyPausedRef?: RefObject<boolean>;
  onActiveIdChange?: (id: string) => void;
};

/**
 * Highlights the section whose heading has scrolled past the top threshold.
 */
export function useScrollSpy({
  enabled = true,
  sectionIds,
  rootRef,
  scrollSpyPausedRef,
  onActiveIdChange,
}: UseScrollSpyOptions) {
  const [activeId, setActiveId] = useState(sectionIds[0] ?? "");
  const rafRef = useRef<number | null>(null);
  const onActiveIdChangeRef = useRef(onActiveIdChange);
  onActiveIdChangeRef.current = onActiveIdChange;

  useEffect(() => {
    const first = sectionIds[0] ?? "";
    if (first) setActiveId(first);
  }, [sectionIds]);

  useEffect(() => {
    if (!activeId) return;
    onActiveIdChangeRef.current?.(activeId);
  }, [activeId]);

  const markActive = useCallback(
    (id: string) => {
      if (!sectionIds.includes(id)) return;
      setActiveId((prev) => (prev === id ? prev : id));
    },
    [sectionIds],
  );

  useEffect(() => {
    if (!enabled) return;

    const measure = () => {
      if (scrollSpyPausedRef?.current) return;
      const root = rootRef?.current ?? null;
      const headerOffset = root ? activeSectionTopThresholdPx(root) : 120;
      let current = sectionIds[0] ?? "";

      for (const id of sectionIds) {
        const section = document.getElementById(id);
        if (!section) continue;
        if (root && !root.contains(section)) continue;

        const rect = section.getBoundingClientRect();
        const top = root ? rect.top - root.getBoundingClientRect().top : rect.top;
        if (top <= headerOffset) current = id;
      }

      setActiveId((prev) => (prev === current ? prev : current));
    };

    const onScroll = () => {
      if (scrollSpyPausedRef?.current) return;
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        measure();
      });
    };

    const scrollTarget: HTMLElement | Window = rootRef?.current ?? window;
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    measure();

    return () => {
      scrollTarget.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled, rootRef, scrollSpyPausedRef, sectionIds]);

  return { activeId, markActive };
}
