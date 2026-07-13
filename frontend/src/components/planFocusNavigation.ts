/**
 * Pointer → plan column resolution and uniform zoom for smooth plan-board focus UX.
 */

import type { PlanColumnBounds, PlanFocusTransform } from "./tesseractPlanLayout";

export interface PlanViewportTransform {
  translateX: number;
  translateY: number;
  scale: number;
}

/** Current pan/zoom applied to the plan viewport (matches TesseractVisual). */
export function resolvePlanViewportTransform(
  planMode: boolean,
  focusedStepIndex: number | null,
  boardScale: number,
  focusTransform: { translateX: number; translateY: number; scale: number },
): PlanViewportTransform {
  if (!planMode) return { translateX: 0, translateY: 0, scale: 1 };
  if (focusedStepIndex == null) {
    return { translateX: 0, translateY: 0, scale: boardScale };
  }
  return {
    translateX: Math.round(focusTransform.translateX * boardScale),
    translateY: Math.round(focusTransform.translateY * boardScale),
    scale: boardScale * focusTransform.scale,
  };
}

/**
 * Map screen coordinates to plan layout space (inverse of viewport transform).
 * Origin is the scene container center; matches cube slot targets.
 */
export function clientToPlanLayoutPoint(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  viewport: PlanViewportTransform,
): { x: number; y: number } {
  const cx = clientX - containerRect.left - containerRect.width / 2;
  const cy = clientY - containerRect.top - containerRect.height / 2;
  const scale = viewport.scale || 1;
  return {
    x: (cx - viewport.translateX) / scale,
    y: (cy - viewport.translateY) / scale,
  };
}

export interface PlanColumnPointerTarget {
  stepIndex: number;
  centerX: number;
  bounds: PlanColumnBounds;
}

/** Map a board-local X (origin = scene center) to the nearest step column. */
export function resolvePlanStepFromPointer(
  pointerX: number,
  columns: ReadonlyArray<PlanColumnPointerTarget>,
): number | null {
  if (columns.length === 0) return null;

  const sorted = [...columns].sort((a, b) => a.centerX - b.centerX);

  for (const col of sorted) {
    const pad = Math.max(8, col.bounds.width * 0.08);
    if (pointerX >= col.bounds.minX - pad && pointerX <= col.bounds.maxX + pad) {
      return col.stepIndex;
    }
  }

  if (sorted.length === 1) return sorted[0]!.stepIndex;

  const firstEdge = (sorted[0]!.centerX + sorted[1]!.centerX) / 2;
  if (pointerX < firstEdge) return sorted[0]!.stepIndex;

  for (let i = 1; i < sorted.length - 1; i += 1) {
    const left = (sorted[i - 1]!.centerX + sorted[i]!.centerX) / 2;
    const right = (sorted[i]!.centerX + sorted[i + 1]!.centerX) / 2;
    if (pointerX >= left && pointerX < right) return sorted[i]!.stepIndex;
  }

  return sorted[sorted.length - 1]!.stepIndex;
}

/**
 * One zoom level for every column so panning between steps does not change scale abruptly.
 */
export function computeUniformPlanFocusScale(
  boundsList: ReadonlyArray<PlanColumnBounds>,
  containerWidth: number,
  containerHeight: number,
  options?: { maxScale?: number; padding?: number; bottomReserve?: number },
): number {
  if (boundsList.length === 0) return 1;

  const padding = options?.padding ?? 32;
  const bottomReserve = options?.bottomReserve ?? 0;
  const maxScale = options?.maxScale ?? 1.9;
  const availW = Math.max(80, containerWidth - padding * 2);
  const availH = Math.max(80, containerHeight - padding * 2 - bottomReserve);

  let fitScale = Infinity;
  for (const bounds of boundsList) {
    const w = Math.max(bounds.width, 48);
    const h = Math.max(bounds.height, 48);
    fitScale = Math.min(fitScale, availW / w, availH / h);
  }

  return Math.min(maxScale, Math.max(1.08, fitScale));
}

/** Pan a column to center using a shared zoom level. */
export function computePlanFocusTransformWithScale(
  bounds: PlanColumnBounds,
  scale: number,
): PlanFocusTransform {
  return {
    scale,
    translateX: -bounds.centerX * scale,
    translateY: -bounds.centerY * scale,
  };
}
