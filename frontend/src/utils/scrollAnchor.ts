/** Scroll a scrollable container so the target id sits near the top (Settings inner pane). */
export function scrollToAnchorInContainer(
  container: HTMLElement | null,
  id: string,
  options: { offset?: number; behavior?: ScrollBehavior } = {}
): void {
  if (!container) return;
  const el = document.getElementById(id);
  if (!el || !container.contains(el)) return;
  const offset = options.offset ?? 12;
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior = options.behavior ?? (reduce ? "auto" : "smooth");
  const cTop = container.getBoundingClientRect().top;
  const eTop = el.getBoundingClientRect().top;
  const nextTop = container.scrollTop + (eTop - cTop) - offset;
  container.scrollTo({
    top: Math.max(0, nextTop),
    behavior,
  });
}

/** Scroll the nearest scrollable ancestor so an element with `id` is visible. */
export function scrollToSectionId(
  id: string,
  options: { behavior?: ScrollBehavior; block?: ScrollLogicalPosition } = {},
): void {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({
    behavior: options.behavior ?? (reduce ? "auto" : "smooth"),
    block: options.block ?? "start",
  });
}
