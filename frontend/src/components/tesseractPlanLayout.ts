/**
 * Pure geometry + types for the Tesseract "plan" layout (the cube plan board).
 *
 * Kept free of React/DOM so the slot positioning can be unit-tested in isolation.
 * `TesseractVisual` imports these and drives the morph animation.
 */

export type CubeStatusVisual = "pending" | "running" | "done" | "error";

export interface TesseractPlanSubtask {
  index: number;
  description: string;
  status: CubeStatusVisual;
}

export interface TesseractPlanStep {
  index: number;
  description: string;
  status: CubeStatusVisual;
  subtasks: TesseractPlanSubtask[];
}

export interface TesseractPlan {
  steps: TesseractPlanStep[];
}

export interface PlanVec3 {
  x: number;
  y: number;
  z: number;
}

/** Minimum step count before the cube reorganization is allowed to trigger. */
export const PLAN_CUBE_MIN_STEPS = 4;

/** Hard cap on rendered cube slots — excess subtasks collapse into "+N" cubes. */
export const PLAN_MAX_SLOTS = 48;

export const PLAN_STEP_CUBE = 34; // px
export const PLAN_SUB_CUBE = 16; // px

/** Horizontal padding reserved inside the scene container (labels + glow). */
const PLAN_BOARD_H_PAD = 28;
/** Vertical padding reserved above/below the cube board. */
const PLAN_BOARD_V_PAD = 72;

interface PlanLayoutMetrics {
  stepSpacingX: number;
  stepCubeSize: number;
  subCubeSize: number;
  subSpacingY: number;
  rowY: number;
  subStartGap: number;
  /** Per-column label width — tracks step spacing so text stays readable. */
  labelMaxWidth: number;
  /** Uniform scale applied when the natural board exceeds the container. */
  boardScale: number;
}

interface PlanBoardLayout {
  slots: CubeSlot[];
  metrics: PlanLayoutMetrics;
}

function maxSubtasksInPlan(plan: TesseractPlan): number {
  return plan.steps.reduce((max, step) => Math.max(max, step.subtasks.length), 0);
}

/**
 * Derive spacing, cube sizes, and a fit scale so the full step row stays inside
 * the Exo center column (not the full window width).
 */
function computePlanLayoutMetrics(
  stepCount: number,
  maxSubtasks: number,
  containerWidth: number,
  containerHeight: number,
): PlanLayoutMetrics {
  const compact = containerWidth < 769;
  const maxSpacing = compact ? 86 : 132;
  const minSpacing = compact ? 44 : 56;
  const availW = Math.max(160, containerWidth - PLAN_BOARD_H_PAD * 2);
  const availH = Math.max(140, containerHeight - PLAN_BOARD_V_PAD);

  let stepCubeSize = PLAN_STEP_CUBE;
  if (stepCount > 6) {
    stepCubeSize = Math.max(24, PLAN_STEP_CUBE - (stepCount - 6) * 2);
  }

  let stepSpacingX =
    stepCount <= 1
      ? 0
      : Math.min(maxSpacing, (availW - stepCubeSize) / (stepCount - 1));
  stepSpacingX = Math.max(minSpacing, stepSpacingX);

  const subSpacingY = compact ? 24 : 28;
  const subStartGap = compact ? 40 : 48;
  const rowY = compact ? -100 : -120;
  const subCubeSize = stepCount > 7 ? Math.max(12, PLAN_SUB_CUBE - 2) : PLAN_SUB_CUBE;

  const rowSpan = stepCount <= 1 ? stepCubeSize : (stepCount - 1) * stepSpacingX + stepCubeSize;
  const labelOverhang = 36;
  const naturalW = rowSpan + labelOverhang;

  const subDepth = maxSubtasks > 0 ? subStartGap + maxSubtasks * subSpacingY + subCubeSize : 0;
  const naturalH = Math.abs(rowY) + subDepth + 48;

  let boardScale = 1;
  if (naturalW > availW) boardScale = Math.min(boardScale, availW / naturalW);
  if (naturalH > availH) boardScale = Math.min(boardScale, availH / naturalH);
  boardScale = Math.max(0.42, Math.min(1, boardScale));

  const labelMaxWidth = Math.max(
    52,
    Math.min(compact ? 110 : 140, stepSpacingX + stepCubeSize + 8),
  );

  return {
    stepSpacingX,
    stepCubeSize,
    subCubeSize,
    subSpacingY,
    rowY,
    subStartGap,
    labelMaxWidth,
    boardScale,
  };
}

export function buildPlanBoardLayout(
  plan: TesseractPlan,
  containerWidth: number,
  containerHeight: number,
): PlanBoardLayout {
  const compacted = compactPlanForLayout(plan);
  const steps = compacted.steps;
  const stepCount = steps.length;
  if (stepCount === 0) {
    return {
      slots: [],
      metrics: computePlanLayoutMetrics(0, 0, containerWidth, containerHeight),
    };
  }

  const metrics = computePlanLayoutMetrics(
    stepCount,
    maxSubtasksInPlan(compacted),
    containerWidth,
    containerHeight,
  );

  const rowWidth = (stepCount - 1) * metrics.stepSpacingX;
  const x0 = -rowWidth / 2;

  const stepSlots: CubeSlot[] = [];
  const subSlots: CubeSlot[] = [];

  const shortTitles = assignUniqueStepShortTitles(steps);

  steps.forEach((step, s) => {
    const x = x0 + s * metrics.stepSpacingX;
    stepSlots.push({
      kind: "step",
      stepIndex: step.index,
      label: shortTitles.get(step.index) ?? deriveStepShortTitle(step.description, step.index),
      detail: step.description,
      status: step.status,
      size: metrics.stepCubeSize,
      target: { x, y: metrics.rowY, z: 0 },
    });
    step.subtasks.forEach((sub, j) => {
      subSlots.push({
        kind: "subtask",
        stepIndex: step.index,
        subIndex: sub.index,
        label: sub.description,
        status: sub.status,
        size: metrics.subCubeSize,
        target: {
          x,
          y: metrics.rowY + metrics.subStartGap + j * metrics.subSpacingY,
          z: 0,
        },
      });
    });
  });

  return { slots: [...stepSlots, ...subSlots], metrics };
}

export interface PlanColumnBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

/** Axis-aligned bounds for one step column (major cube + subtask spine + label slack). */
export function computePlanColumnBounds(
  slots: CubeSlot[],
  positions: ReadonlyArray<{ x: number; y: number }>,
  stepIndex: number,
  labelMaxWidth: number,
): PlanColumnBounds | null {
  const indices: number[] = [];
  slots.forEach((slot, i) => {
    if (slot.stepIndex === stepIndex) indices.push(i);
  });
  if (indices.length === 0) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const i of indices) {
    const slot = slots[i]!;
    const pos = positions[i]!;
    const half = slot.size / 2;
    const labelW = slot.kind === "step" ? labelMaxWidth : labelMaxWidth + 24;
    const labelTop = slot.kind === "step" ? 40 : 0;
    const labelLeft = slot.kind === "subtask" ? labelW : labelMaxWidth / 2;
    const labelRight = slot.kind === "subtask" ? 16 : labelMaxWidth / 2;

    minX = Math.min(minX, pos.x - half - labelLeft);
    maxX = Math.max(maxX, pos.x + half + labelRight);
    minY = Math.min(minY, pos.y - half - labelTop);
    maxY = Math.max(maxY, pos.y + half + (slot.kind === "subtask" ? 12 : 8));
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export interface PlanFocusTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

/**
 * Pan/zoom the plan viewport so a column fills the scene container comfortably.
 * Coordinates match cube offsets from the scene center (0, 0).
 */
export function computePlanFocusTransform(
  bounds: PlanColumnBounds,
  containerWidth: number,
  containerHeight: number,
  options?: { maxScale?: number; padding?: number; bottomReserve?: number },
): PlanFocusTransform {
  const padding = options?.padding ?? 28;
  const bottomReserve = options?.bottomReserve ?? 0;
  const maxScale = options?.maxScale ?? 2.35;
  const availW = Math.max(80, containerWidth - padding * 2);
  const availH = Math.max(80, containerHeight - padding * 2 - bottomReserve);

  const fitScale = Math.min(availW / Math.max(bounds.width, 48), availH / Math.max(bounds.height, 48));
  const scale = Math.min(maxScale, Math.max(1.12, fitScale));

  return {
    scale,
    translateX: -bounds.centerX * scale,
    translateY: -bounds.centerY * scale,
  };
}

export type PlanBoardPhase = "planning" | "running" | "complete" | "error" | "cancelled";

/** Keyword → short tile for the plan overview row. Order = most specific first. */
const STEP_SHORT_LABEL_RULES: ReadonlyArray<[RegExp, string]> = [
  [/\bcreate\b.*\b(type|mock|data|model)/i, "Data"],
  [/\badd\b.*\bpost/i, "Add"],
  [/\binstall\b|\bdependencies\b|\bpackages\b/i, "Install"],
  [/\bverify\b|\bvalidate\b|\bcheck\b/i, "Verify"],
  [/\bpreview\b|\bin browser\b/i, "Preview"],
  [/\bstart\b.*\b(server|dev)/i, "Start"],
  [/\bfix\b|\brepair\b|\bbuild error/i, "Fix"],
  [/\bscaffold\b|\bstructure\b|\binit\b/i, "Setup"],
  [/\bfilter/i, "Filters"],
  [/\bstate\b|\bstorage\b|\breducer\b|\blocalstorage/i, "State"],
  [/\bstyle\b|\btailwind\b|\bcss\b|\btheme\b/i, "Style"],
  [/\bimplement\b|\bintegrate\b|\bwire up\b/i, "Build"],
  [/\bcomponent\b|\binterface\b|\bscreen\b|\blayout\b|\bui\b/i, "UI"],
];

const SHORT_TITLE_MAX_LEN = 9;

/**
 * Compact tile shown above each step cube in overview mode.
 * Full {@link TesseractPlanStep.description} stays in {@link CubeSlot.detail}.
 */
export function deriveStepShortTitle(description: string, stepIndex: number): string {
  const trimmed = description.trim();
  for (const [pattern, label] of STEP_SHORT_LABEL_RULES) {
    if (pattern.test(trimmed)) return label;
  }
  const words = trimmed
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(the|a|an|with|for|and|to|in|of|all|main|simple|using)$/iu.test(w));
  if (words.length === 0) return `${stepIndex}`;
  const first = words[0]!;
  const capped =
    first.length <= SHORT_TITLE_MAX_LEN ? first : `${first.slice(0, SHORT_TITLE_MAX_LEN - 1)}…`;
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

/** Ensure overview tiles stay unique when several steps map to the same keyword. */
export function assignUniqueStepShortTitles(steps: TesseractPlanStep[]): Map<number, string> {
  const raw = steps.map((step) => ({
    index: step.index,
    label: deriveStepShortTitle(step.description, step.index),
  }));
  const dupes = new Map<string, number>();
  for (const { label } of raw) dupes.set(label, (dupes.get(label) ?? 0) + 1);

  const seen = new Map<string, number>();
  const result = new Map<number, string>();
  for (const { index, label } of raw) {
    if ((dupes.get(label) ?? 0) <= 1) {
      result.set(index, label);
      continue;
    }
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    result.set(index, n === 1 ? label : `${label} ${n}`);
  }
  return result;
}

export type CubeSlot =
  | {
      kind: "step";
      stepIndex: number;
      /** Short overview tile (e.g. "Install", "State"). */
      label: string;
      /** Full planner description — shown as subtitle when focused. */
      detail: string;
      status: CubeStatusVisual;
      size: number;
      target: PlanVec3;
    }
  | {
      kind: "subtask";
      stepIndex: number;
      subIndex: number;
      label: string;
      status: CubeStatusVisual;
      size: number;
      target: PlanVec3;
    };

/** Stable layout positions — avoids RAF jitter in focus/hit-zone math. */
export function planSlotTargets(slots: CubeSlot[]): PlanVec3[] {
  return slots.map((s) => s.target);
}

function stepIndexForSlot(slot: CubeSlot | undefined): number | null {
  if (!slot) return null;
  return slot.stepIndex;
}

/**
 * Whether a plan-board connection should show the traveling mini-cube.
 *
 * Idle tesseract mode animates all edges while WORKING; plan mode must mirror
 * that on every edge that is actively carrying work — not only the single
 * done→running handoff between major steps.
 */
export function shouldShowPlanTravelCube(
  slotA: CubeSlot | undefined,
  slotB: CubeSlot | undefined,
  stepStatusByIndex: ReadonlyMap<number, CubeStatusVisual>,
  planPhase?: PlanBoardPhase | null,
): boolean {
  if (!slotA || !slotB) return false;

  if (slotA.status === "running" || slotB.status === "running") return true;

  const stepA = stepIndexForSlot(slotA);
  const stepB = stepIndexForSlot(slotB);

  // Subtask spine: pulse the whole column while its parent step is running.
  if (stepB !== null && slotB.kind === "subtask" && stepStatusByIndex.get(stepB) === "running") {
    return true;
  }
  if (
    stepA !== null &&
    stepB !== null &&
    stepA === stepB &&
    slotA.kind === "subtask" &&
    slotB.kind === "subtask" &&
    stepStatusByIndex.get(stepA) === "running"
  ) {
    return true;
  }

  // The major-step handoff (done feeding running) is already covered by the
  // "either slot is running" early-return above.

  // Before the first step_start — keep the step row alive while planning.
  if (planPhase === "planning" && slotA.kind === "step" && slotB.kind === "step") {
    return true;
  }

  return false;
}

/**
 * When a plan would exceed {@link PLAN_MAX_SLOTS}, trim subtask columns and
 * append a single "+N" overflow cube per step that had hidden subtasks.
 */
export function compactPlanForLayout(plan: TesseractPlan, maxSlots = PLAN_MAX_SLOTS): TesseractPlan {
  const stepCount = plan.steps.length;
  if (stepCount === 0) return plan;

  const totalSubtasks = plan.steps.reduce((n, s) => n + s.subtasks.length, 0);
  if (stepCount + totalSubtasks <= maxSlots) return plan;

  let budget = maxSlots - stepCount;
  if (budget < 0) budget = 0;

  const steps = plan.steps.map((step) => {
    const subs = step.subtasks;
    if (subs.length === 0) return step;
    if (subs.length <= budget) {
      budget -= subs.length;
      return step;
    }
    if (budget <= 1) {
      const hidden = subs.length;
      budget = 0;
      return {
        ...step,
        subtasks: hidden > 0
          ? [{ index: 999, description: `+${hidden}`, status: subs[0]?.status ?? "pending" }]
          : [],
      };
    }
    const visibleCount = budget - 1;
    const hidden = subs.length - visibleCount;
    budget -= visibleCount + 1;
    return {
      ...step,
      subtasks: [
        ...subs.slice(0, visibleCount),
        { index: 999, description: `+${hidden}`, status: subs[visibleCount]?.status ?? "pending" },
      ],
    };
  });

  return { steps };
}

/**
 * Build cube slots for a plan board. Prefer {@link buildPlanBoardLayout} when
 * metrics (scale, label width) are needed for rendering.
 */
export function buildPlanSlots(
  plan: TesseractPlan,
  containerWidth: number,
  containerHeight = 360,
): CubeSlot[] {
  return buildPlanBoardLayout(plan, containerWidth, containerHeight).slots;
}

/**
 * Plan-mode connections: step row (consecutive steps) + each step's subtask
 * spine. Index references match {@link buildPlanSlots} ordering (steps first,
 * then subtasks grouped per step).
 */
export function buildPlanConnections(plan: TesseractPlan): { a: number; b: number }[] {
  const compacted = compactPlanForLayout(plan);
  const steps = compacted.steps;
  const stepCount = steps.length;
  const conns: { a: number; b: number }[] = [];
  for (let s = 0; s < stepCount - 1; s++) conns.push({ a: s, b: s + 1 });
  let subIdx = stepCount;
  steps.forEach((step, s) => {
    let prev = s;
    step.subtasks.forEach(() => {
      conns.push({ a: prev, b: subIdx });
      prev = subIdx;
      subIdx += 1;
    });
  });
  return conns;
}
