import { useCallback, type RefObject } from "react";
import { scrollToAnchorInContainer } from "../utils/scrollAnchor";
import { useScrollSpy } from "./useScrollSpy";

/** Offset from top of the settings scroll pane when jumping to a section (matches side nav highlight). */
const SETTINGS_SCROLL_TOP_OFFSET_PX = 8;

type ScrollOptions = { behavior?: ScrollBehavior };

/**
 * Scroll position tracking and programmatic scroll for the Settings inner pane.
 */
export function useSettingsPanelScroll(options: {
  scrollRef: RefObject<HTMLDivElement | null>;
  sectionIds: readonly string[];
  scrollSpyPausedRef: RefObject<boolean>;
  onActiveSectionChange?: (sectionId: string) => void;
}) {
  const { scrollRef, sectionIds, scrollSpyPausedRef, onActiveSectionChange } = options;

  const { activeId, markActive } = useScrollSpy({
    sectionIds,
    rootRef: scrollRef,
    scrollSpyPausedRef,
    onActiveIdChange: onActiveSectionChange,
  });

  const scrollToSectionId = useCallback(
    (id: string, opts?: ScrollOptions) =>
      scrollToAnchorInContainer(scrollRef.current, id, {
        offset: SETTINGS_SCROLL_TOP_OFFSET_PX,
        behavior: opts?.behavior ?? "auto",
      }),
    [scrollRef],
  );

  return {
    activeSectionId: activeId,
    scrollToSectionId,
    markSectionActive: markActive,
  };
}
