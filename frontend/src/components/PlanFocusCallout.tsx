/**
 * Readable detail panel for a focused plan column — short title + full subtitle.
 */

import type { CubeSlot, CubeStatusVisual } from "./tesseractPlanLayout";

interface PlanFocusCalloutProps {
  stepPosition: number;
  stepTotal: number;
  shortTitle: string;
  detail: string;
  stepStatus: CubeStatusVisual;
}

export default function PlanFocusCallout({
  stepPosition,
  stepTotal,
  shortTitle,
  detail,
  stepStatus,
}: PlanFocusCalloutProps) {
  return (
    <div className="tv-plan-focus-callout" role="status" aria-live="polite">
      <div className="tv-plan-focus-callout__header">
        <span className={`tv-plan-focus-callout__badge tv-plan-focus-callout__badge--${stepStatus}`}>
          Step {stepPosition} of {stepTotal}
        </span>
        <p className="tv-plan-focus-callout__title">{shortTitle}</p>
        {detail && detail !== shortTitle && (
          <p className="tv-plan-focus-callout__detail">{detail}</p>
        )}
      </div>
    </div>
  );
}

/** Step tile + full description for the focus callout. */
export function stepFocusCopy(
  slots: CubeSlot[],
  stepIndex: number,
): { shortTitle: string; detail: string } | null {
  const step = slots.find((s): s is Extract<CubeSlot, { kind: "step" }> => s.kind === "step" && s.stepIndex === stepIndex);
  if (!step) return null;
  return { shortTitle: step.label, detail: step.detail };
}
