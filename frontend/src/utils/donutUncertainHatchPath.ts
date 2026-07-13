/** Annulus sector path for SVG overlay (matches conic-gradient: 0° top, clockwise). */

const DONUT_VIEW = 200;
const DONUT_CX = DONUT_VIEW / 2;
const DONUT_CY = DONUT_VIEW / 2;
/** Same as ``DONUT_RING_INNER_RATIO`` in ``donutSegmentFromPointer`` (``inset-[18%]``). */
const DONUT_RING_INNER_RATIO = 0.64;

function polarFromTopCw(cx: number, cy: number, r: number, degCwFromTop: number): [number, number] {
  const rad = (degCwFromTop * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

/**
 * SVG path for one donut ring sector (outer/inner radii as fraction of half the box side).
 *
 * @param startDeg — Start angle in degrees, clockwise from top (same as CSS ``conic-gradient``).
 * @param endDeg — End angle in degrees (exclusive upper bound in slice math; use full sweep).
 */
export function donutAnnulusSectorPath(startDeg: number, endDeg: number): string {
  const rOuter = DONUT_VIEW / 2;
  const rInner = rOuter * DONUT_RING_INNER_RATIO;
  const cx = DONUT_CX;
  const cy = DONUT_CY;
  const [x1, y1] = polarFromTopCw(cx, cy, rOuter, startDeg);
  const [x2, y2] = polarFromTopCw(cx, cy, rOuter, endDeg);
  const [x3, y3] = polarFromTopCw(cx, cy, rInner, endDeg);
  const [x4, y4] = polarFromTopCw(cx, cy, rInner, startDeg);
  let delta = endDeg - startDeg;
  while (delta <= 0) delta += 360;
  while (delta > 360) delta -= 360;
  const largeArc = delta > 180 ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

export const DONUT_UNCERTAIN_HATCH_VIEWBOX = `0 0 ${DONUT_VIEW} ${DONUT_VIEW}`;
