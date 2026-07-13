import type { CSSProperties } from "react";

/**
 * Avoids `width: X%` on the fill when the track’s used width can be indefinite (cyclic %),
 * which leaves the bar visually empty while the label still updates.
 */
export function pipelineProgressFillStyle(percent: number): CSSProperties {
  const clamped = Math.max(0, Math.min(100, percent));
  return { transform: `scaleX(${clamped / 100})` };
}
