import { useLayoutEffect, useRef, useState } from "react";
import type { BrainNode } from "./graphModel";
import { computeHoverCardPosition } from "./brainMapHoverPosition";

interface Props {
  node: BrainNode;
  pointerX: number;
  pointerY: number;
  containerWidth: number;
  containerHeight: number;
  /** Width to keep clear on the right (e.g. open inspector panel). */
  reservedRight?: number;
  kindLabel: string;
  colorHex: string;
  moreItemsLabel: (count: number) => string;
  clickHint: string;
}

export default function BrainMapHoverCard({
  node,
  pointerX,
  pointerY,
  containerWidth,
  containerHeight,
  reservedRight = 0,
  kindLabel,
  colorHex,
  moreItemsLabel,
  clickHint,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: pointerX, top: pointerY });

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPosition(
      computeHoverCardPosition(
        pointerX,
        pointerY,
        width,
        height,
        containerWidth,
        containerHeight,
        reservedRight,
      ),
    );
  }, [pointerX, pointerY, containerWidth, containerHeight, reservedRight, node.id]);

  const preview = node.preview;
  const subtitle = preview?.subtitle ?? (node.detail !== node.label ? node.detail : undefined);

  return (
    <div
      ref={cardRef}
      className="pointer-events-none absolute z-20 w-[min(20rem,calc(100%-1.5rem))] overflow-hidden rounded-xl border border-border bg-bg-primary/97 shadow-2xl backdrop-blur-md"
      style={{ left: position.left, top: position.top }}
    >
      <div className="h-1 w-full" style={{ background: colorHex }} />
      <div className="space-y-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-sm"
            style={{ background: colorHex, boxShadow: `0 0 8px ${colorHex}88` }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            {kindLabel}
          </span>
        </div>
        <p className="text-sm font-semibold leading-snug text-text-primary">{node.label}</p>
        {subtitle && (
          <p className="line-clamp-3 text-xs leading-relaxed text-text-secondary">{subtitle}</p>
        )}
        {preview?.items && preview.items.length > 0 && (
          <ul className="space-y-0.5 border-t border-border/60 pt-2">
            {preview.items.map((item) => (
              <li
                key={item}
                className="truncate text-[11px] text-text-secondary before:mr-1.5 before:text-muted before:content-['·']"
              >
                {item}
              </li>
            ))}
            {preview.itemOverflow ? (
              <li className="text-[10px] font-medium text-muted">
                {moreItemsLabel(preview.itemOverflow)}
              </li>
            ) : null}
          </ul>
        )}
        {preview?.meta && (
          <p className="border-t border-border/60 pt-2 text-[10px] font-medium text-muted">
            {preview.meta}
          </p>
        )}
        <p className="text-[10px] text-muted/80">{clickHint}</p>
      </div>
    </div>
  );
}
