import type { ReactNode } from "react";

interface HoverHelpCardProps {
  /** Shown in a floating card on hover / focus-within */
  hint: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps a **small** target (e.g. section title). Full explanation appears in a card below on hover / focus-within.
 * Do not wrap large regions that contain other interactive UI: in CSS, `:hover` applies to an element when any
 * descendant is hovered, so a parent `HoverHelpCard` would show its hint whenever the user uses nested controls.
 */
export default function HoverHelpCard({ hint, children, className = "" }: HoverHelpCardProps) {
  return (
    <div
      className={`group/hhc relative cursor-help rounded-xl border border-transparent outline-none transition-colors hover:border-border/70 hover:bg-hover-overlay/15 focus-within:border-border/70 focus-within:bg-hover-overlay/15 ${className}`.trim()}
      tabIndex={0}
    >
      <div
        className="pointer-events-none absolute top-[calc(100%+0.5rem)] left-0 z-50 w-[min(22rem,calc(100vw-2.5rem))] max-w-md rounded-xl border border-border bg-bg-card px-3.5 py-3 text-2xs text-muted leading-relaxed shadow-lg opacity-0 shadow-black/10 transition-[opacity,visibility] duration-150 invisible group-hover/hhc:pointer-events-auto group-hover/hhc:opacity-100 group-hover/hhc:visible group-focus-within/hhc:pointer-events-auto group-focus-within/hhc:opacity-100 group-focus-within/hhc:visible dark:shadow-black/40 max-h-[min(70vh,20rem)] overflow-y-auto"
        role="tooltip"
      >
        {hint}
      </div>
      {children}
    </div>
  );
}
