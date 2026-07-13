/** Pointer → conic segment (same angle convention as swissAligner ERP Overview donut). */

/** Inner / outer radius ratio — matches Swiss-style hole (`inset: 18%` on inner disk). */
const DONUT_RING_INNER_RATIO = 0.64;

export function pointerAngleDeg(clientX: number, clientY: number, rect: DOMRect): number {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
}

/** True if the pointer lies in the visible ring (not the hub, not outside the circle). */
export function pointerInDonutRing(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  innerRatio = DONUT_RING_INNER_RATIO
): boolean {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const r = Math.min(rect.width, rect.height) / 2;
  return dist >= r * innerRatio - 0.5 && dist <= r + 0.5;
}

/** Which slice (0 … counts.length-1) the angle falls into, for conic starting at top, clockwise. */
export function segmentIndexFromAngle(angleDeg: number, counts: number[], sum: number): number {
  if (counts.length === 0 || sum <= 0) return 0;
  let acc = 0;
  for (let i = 0; i < counts.length; i++) {
    const sliceDeg = (counts[i] / sum) * 360;
    const end = acc + sliceDeg;
    if (angleDeg <= end) return i;
    acc = end;
  }
  return counts.length - 1;
}
