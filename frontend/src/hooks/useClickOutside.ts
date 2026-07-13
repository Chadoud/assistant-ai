import { useEffect, useRef, type RefObject } from "react";

/** Fires when user clicks/taps outside `ref` (e.g. close a dropdown). */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  handler: () => void,
  enabled: boolean,
  /** e.g. portaled dropdown panel — still counts as “inside”. */
  extraInsideRefs?: Array<RefObject<HTMLElement | null>>,
) {
  const extraInsideRefsRef = useRef<Array<RefObject<HTMLElement | null>> | undefined>(undefined);
  extraInsideRefsRef.current = extraInsideRefs;

  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const el = ref.current;
      if (el?.contains(t)) return;
      for (const r of extraInsideRefsRef.current ?? []) {
        if (r.current?.contains(t)) return;
      }
      handler();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ref, handler, enabled]);
}
