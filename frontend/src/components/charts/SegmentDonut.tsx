import { useCallback, useId, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import DonutHoverTooltip from "../DonutHoverTooltip";
import {
  pointerAngleDeg,
  pointerInDonutRing,
  segmentIndexFromAngle,
} from "../../utils/donutSegmentFromPointer";
import { donutAnnulusSectorPath, DONUT_UNCERTAIN_HATCH_VIEWBOX } from "../../utils/donutUncertainHatchPath";

export type SegmentDonutItem = {
  id: string;
  label: string;
  count: number;
  color: string;
  /** Render diagonal hatch overlay (queue uncertain bucket). */
  uncertainHatch?: boolean;
};

interface SegmentDonutProps {
  items: SegmentDonutItem[];
  totalLabel: string;
  totalUnit: string;
  ariaLabel: string;
  emptyMessage: string;
  embeddedEmpty?: boolean;
  className?: string;
  onSegmentClick?: (item: SegmentDonutItem, index: number) => void;
  /** Legend below the ring; receives hover index from the donut. */
  renderLegend?: (items: SegmentDonutItem[], hoverIdx: number | null) => ReactNode;
}

/**
 * Reusable count donut — shared by queue destination breakdown and memory overview.
 */
export default function SegmentDonut({
  items,
  totalLabel,
  totalUnit,
  ariaLabel,
  emptyMessage,
  embeddedEmpty = false,
  className = "",
  onSegmentClick,
  renderLegend,
}: SegmentDonutProps) {
  const uncertainHatchPatternId = useId().replace(/:/g, "");
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tipPos, setTipPos] = useState<{ x: number; y: number; w: number } | null>(null);

  const counts = useMemo(() => items.map((item) => item.count), [items]);

  const handleDonutMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (total <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (!pointerInDonutRing(e.clientX, e.clientY, rect)) {
        setHoverIdx(null);
        setTipPos(null);
        return;
      }
      const angle = pointerAngleDeg(e.clientX, e.clientY, rect);
      const idx = segmentIndexFromAngle(angle, counts, total);
      setHoverIdx(idx);
      setTipPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        w: rect.width,
      });
    },
    [counts, total],
  );

  const handleDonutLeave = useCallback(() => {
    setHoverIdx(null);
    setTipPos(null);
  }, []);

  const handleDonutClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!onSegmentClick || total <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (!pointerInDonutRing(e.clientX, e.clientY, rect)) return;
      const angle = pointerAngleDeg(e.clientX, e.clientY, rect);
      const idx = segmentIndexFromAngle(angle, counts, total);
      const item = items[idx];
      if (item) onSegmentClick(item, idx);
    },
    [counts, items, onSegmentClick, total],
  );

  const { conic, uncertainWedge } = useMemo((): {
    conic: string;
    uncertainWedge: { startDeg: number; endDeg: number; patternId: string } | null;
  } => {
    if (total <= 0) {
      return { conic: "conic-gradient(transparent 0deg 360deg)", uncertainWedge: null };
    }
    let acc = 0;
    const stops: string[] = [];
    let wedge: { startDeg: number; endDeg: number; patternId: string } | null = null;
    items.forEach((item) => {
      const startDeg = (acc / total) * 360;
      acc += item.count;
      const endDeg = (acc / total) * 360;
      if (item.uncertainHatch) {
        stops.push(`#f8fafc ${startDeg}deg ${endDeg}deg`);
        wedge = { startDeg, endDeg, patternId: uncertainHatchPatternId };
      } else {
        stops.push(`${item.color} ${startDeg}deg ${endDeg}deg`);
      }
    });
    return {
      conic: `conic-gradient(${stops.join(", ")})`,
      uncertainWedge: wedge,
    };
  }, [items, total, uncertainHatchPatternId]);

  if (total === 0) {
    if (embeddedEmpty) {
      return (
        <p className={`text-2xs text-muted text-center leading-relaxed py-10 px-1 ${className}`.trim()}>
          {emptyMessage}
        </p>
      );
    }
    return (
      <div
        className={`rounded-xl border border-dashed border-border-soft bg-bg-card/50 px-4 py-8 text-center ${className}`.trim()}
      >
        <p className="text-2xs text-muted leading-relaxed">{emptyMessage}</p>
      </div>
    );
  }

  const hoverItem = hoverIdx != null ? items[hoverIdx] : null;

  return (
    <div className={`flex flex-col items-center justify-center gap-4 w-full ${className}`.trim()}>
      <div
        className={`relative w-[200px] h-[200px] mx-auto shrink-0 [transform:translateZ(0)] ${
          onSegmentClick ? "cursor-pointer" : "cursor-default"
        }`}
        onMouseMove={handleDonutMove}
        onMouseLeave={handleDonutLeave}
        onClick={handleDonutClick}
        role="img"
        aria-label={ariaLabel}
      >
        <div
          className="absolute inset-0 rounded-full after:content-[''] after:absolute after:inset-[18%] after:rounded-full after:bg-bg-card"
          style={{ background: conic }}
          aria-hidden
        />
        {uncertainWedge ? (
          <svg
            className="absolute inset-0 w-full h-full rounded-full overflow-hidden pointer-events-none"
            viewBox={DONUT_UNCERTAIN_HATCH_VIEWBOX}
            aria-hidden
          >
            <defs>
              <pattern
                id={uncertainHatchPatternId}
                width="10"
                height="10"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="10" height="10" fill="#ffffff" />
                <path d="M-2,2 l5,-5 M3,12 l8,-8" stroke="#94a3b8" strokeWidth="1.25" fill="none" />
              </pattern>
            </defs>
            <path
              d={donutAnnulusSectorPath(uncertainWedge.startDeg, uncertainWedge.endDeg)}
              fill={`url(#${uncertainHatchPatternId})`}
            />
          </svg>
        ) : null}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[0.625rem] font-semibold text-muted uppercase tracking-[0.05em] leading-none">
            {totalLabel}
          </span>
          <span className="text-xl font-bold tabular-nums text-text-primary leading-tight mt-0.5">
            {total}
          </span>
          <span className="text-xs text-muted leading-none mt-0.5">{totalUnit}</span>
        </div>
        {hoverItem && tipPos ? (
          <DonutHoverTooltip
            x={tipPos.x}
            y={tipPos.y}
            wrapWidth={tipPos.w}
            value={hoverItem.count}
            label={hoverItem.label}
          />
        ) : null}
      </div>
      {renderLegend ? renderLegend(items, hoverIdx) : null}
    </div>
  );
}
