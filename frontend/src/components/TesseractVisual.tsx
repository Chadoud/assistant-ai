import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useI18n } from "../i18n/I18nContext";
import { useDocumentPageHidden } from "../hooks/useDocumentPageHidden";
import "./TesseractVisual.css";
import { TESSERACT_LAUNCH_COMPLETE_MS } from "../exo/exoLandingTiming";
import {
  applyCssAnimationPlaybackRate,
  stepSmoothedPlaybackRate,
  type VoiceTesseractDrive,
} from "../voice/voiceTesseractPlayback";
import {
  type CubeSlot,
  type CubeStatusVisual,
  type PlanBoardPhase,
  type TesseractPlan,
  buildPlanBoardLayout,
  buildPlanConnections,
  computePlanColumnBounds,
  planSlotTargets,
  PLAN_SUB_CUBE,
  shouldShowPlanTravelCube,
} from "./tesseractPlanLayout";
import PlanFocusCallout, { stepFocusCopy } from "./PlanFocusCallout";
import {
  clientToPlanLayoutPoint,
  computePlanFocusTransformWithScale,
  computeUniformPlanFocusScale,
  resolvePlanStepFromPointer,
  resolvePlanViewportTransform,
  type PlanColumnPointerTarget,
  type PlanViewportTransform,
} from "./planFocusNavigation";

export { type TesseractPlan } from "./tesseractPlanLayout";

// ─── Single cube ────────────────────────────────────────────────────────────

interface CubeProps {
  position: { x: number; y: number; z: number };
  size: number;
  delay: number;
  /** Plan-mode status that recolors the cube; omit for the idle tesseract. */
  status?: CubeStatusVisual;
  /** 0-1 opacity for enter/exit transitions (plan mode). Defaults to 1. */
  opacity?: number;
  /** Disables CSS float so the RAF-driven plan layout reads as a stable board. */
  noFloat?: boolean;
  dimmed?: boolean;
}

/** Position transform shared by the initial render and the imperative RAF updates. */
function cubeTransform(position: Vec3): string {
  return `translate(-50%, -50%) translate3d(${position.x}px, ${position.y}px, ${position.z}px)`;
}

function applyPlanCubeDom(
  node: HTMLDivElement | null,
  cube: { pos: Vec3; opacity: number },
  slot: CubeSlot | undefined,
  focusedStepIndex: number | null,
): void {
  if (!node) return;
  const columnActive =
    focusedStepIndex == null || slot?.stepIndex === focusedStepIndex;
  node.style.transform = cubeTransform(cube.pos);
  node.style.opacity = String(cube.opacity * (columnActive ? 1 : 0.22));
}

const Cube = forwardRef<HTMLDivElement, CubeProps>(function Cube(
  { position, size, delay, status, opacity = 1, noFloat = false, dimmed = false },
  ref,
) {
  const half = size / 2;
  const statusClass = status ? ` tv-cube--${status}` : "";
  const dimClass = dimmed ? " tv-cube--dimmed" : "";
  return (
    <div
      ref={ref}
      className={`tv-cube${noFloat ? " tv-cube--static" : ""}${statusClass}${dimClass}`}
      style={
        {
          transform: cubeTransform(position),
          width: `${size}px`,
          height: `${size}px`,
          animationDelay: `${delay}s`,
          opacity,
          "--tv-cube-size": `${size}px`,
        } as React.CSSProperties
      }
    >
      <div className="tv-cube-wrapper">
        <div className="tv-face" style={{ transform: `rotateY(0deg)   translateZ(${half}px)` }} />
        <div className="tv-face" style={{ transform: `rotateY(180deg) translateZ(${half}px)` }} />
        <div className="tv-face" style={{ transform: `rotateY(90deg)  translateZ(${half}px)` }} />
        <div className="tv-face" style={{ transform: `rotateY(-90deg) translateZ(${half}px)` }} />
        <div className="tv-face" style={{ transform: `rotateX(90deg)  translateZ(${half}px)` }} />
        <div className="tv-face" style={{ transform: `rotateX(-90deg) translateZ(${half}px)` }} />
      </div>
    </div>
  );
});

// ─── Mini cube that travels along a connection line ──────────────────────────

const TRAVEL_CUBE_SIZE = 7; // px — smaller than the main cubes but same style

interface TravelCubeProps {
  dotDelay: string;
  dotDuration: string;
}

const TravelCube: React.FC<TravelCubeProps> = ({ dotDelay, dotDuration }) => {
  const half = TRAVEL_CUBE_SIZE / 2;
  return (
    <div
      className="tv-travel-cube"
      style={
        {
          "--tv-cube-size":    `${TRAVEL_CUBE_SIZE}px`,
          "--tv-dot-delay":    dotDelay,
          "--tv-dot-duration": dotDuration,
        } as React.CSSProperties
      }
    >
      <div className="tv-face" style={{ transform: `rotateY(0deg)   translateZ(${half}px)` }} />
      <div className="tv-face" style={{ transform: `rotateY(180deg) translateZ(${half}px)` }} />
      <div className="tv-face" style={{ transform: `rotateY(90deg)  translateZ(${half}px)` }} />
      <div className="tv-face" style={{ transform: `rotateY(-90deg) translateZ(${half}px)` }} />
      <div className="tv-face" style={{ transform: `rotateX(90deg)  translateZ(${half}px)` }} />
      <div className="tv-face" style={{ transform: `rotateX(-90deg) translateZ(${half}px)` }} />
    </div>
  );
};

// ─── Connection line between two neighbour cubes ─────────────────────────────

type Vec3 = { x: number; y: number; z: number };

interface ConnectionLineProps {
  posA: Vec3;
  posB: Vec3;
  pairIndex: number;
  /** When false, the line is drawn but no mini-cube travels along it. Defaults to true. */
  showTravelCube?: boolean;
}

/** Imperative handle so RAF can re-point a line without a React re-render. */
interface ConnectionLineHandle {
  setEndpoints(posA: Vec3, posB: Vec3): void;
  setVisible(visible: boolean): void;
}

const RAD_TO_DEG = 180 / Math.PI;

/** Anchor transform + bar length for a line between two 3D points. */
function connGeometry(posA: Vec3, posB: Vec3): { transform: string; length: number } {
  const dx = posB.x - posA.x;
  const dy = posB.y - posA.y;
  const dz = posB.z - posA.z;

  // True 3D Euclidean length — correct even when cubes have spread unevenly.
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Midpoint in 3D space.
  const mx = (posA.x + posB.x) / 2;
  const my = (posA.y + posB.y) / 2;
  const mz = (posA.z + posB.z) / 2;

  // Azimuth (around Z) and elevation (around Y after azimuth) so the div's
  // default +X axis aligns with the actual direction vector.
  const azimuthDeg = Math.atan2(dy, dx) * RAD_TO_DEG;
  const elevationDeg = -Math.atan2(dz, Math.sqrt(dx * dx + dy * dy)) * RAD_TO_DEG;
  const rotation = `rotateZ(${azimuthDeg}deg) rotateY(${elevationDeg}deg)`;

  return {
    transform: `translate(-50%, -50%) translate3d(${mx}px, ${my}px, ${mz}px) ${rotation}`,
    length,
  };
}

const ConnectionLine = forwardRef<ConnectionLineHandle, ConnectionLineProps>(function ConnectionLine(
  { posA, posB, pairIndex, showTravelCube = true },
  ref,
) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    setEndpoints(a: Vec3, b: Vec3) {
      const anchor = anchorRef.current;
      const inner = innerRef.current;
      if (!anchor || !inner) return;
      const { transform, length } = connGeometry(a, b);
      anchor.style.transform = transform;
      inner.style.width = `${length}px`;
    },
    setVisible(visible: boolean) {
      const anchor = anchorRef.current;
      if (!anchor) return;
      anchor.style.opacity = visible ? "1" : "0";
      anchor.style.pointerEvents = visible ? "" : "none";
    },
  }), []);

  const initial = connGeometry(posA, posB);
  const lineDelay = pairIndex * 0.018;

  // Cube starts after the line is fully drawn (draw takes 0.5 s).
  const cubeDuration = `${0.6 + deterministicRandom(pairIndex * 7 + 1) * 1.2}s`;
  const cubeDelay    = `${lineDelay + 0.55 + deterministicRandom(pairIndex * 7 + 3) * 1.4}s`;

  return (
    <div
      ref={anchorRef}
      className="tv-conn-anchor"
      style={{ transform: initial.transform }}
    >
      {/* Line bar — has opacity in its draw animation, so the cube must NOT be nested inside */}
      <div
        ref={innerRef}
        className="tv-conn-inner"
        style={
          {
            width: `${initial.length}px`,
            "--tv-line-delay": `${lineDelay}s`,
          } as React.CSSProperties
        }
      />
      {/* Travel cube is a direct child of the anchor — no opacity-animated ancestor
          between it and the scene, so transform-style: preserve-3d is never cancelled. */}
      {showTravelCube && <TravelCube dotDelay={cubeDelay} dotDuration={cubeDuration} />}
    </div>
  );
});

// ─── Wordmark ────────────────────────────────────────────────────────────────

function WordmarkWingPair() {
  return (
    <div className="tv-wordmark-wing" aria-hidden="true">
      <span className="tv-wordmark-wing-line" />
    </div>
  );
}

// ─── Personality helpers ─────────────────────────────────────────────────────

/** Deterministic pseudo-random number in [0, 1) from an integer seed. */
function deterministicRandom(n: number): number {
  return Math.abs((Math.sin(n * 127.1) * 43758.5453) % 1);
}

const CUBE_COUNT = 27;
const FREQ_BAND_COUNT = 8;
const PLAN_POS_ALPHA = 0.09;
const PLAN_OP_ALPHA = 0.08;
const PLAN_STAGGER_MS = 75;
const PLAN_REVEAL_MS = 520;
/** Delay before the first subtask cube reveals, so the step row lands first. */
const PLAN_SUBTASK_REVEAL_BASE_MS = 160;

/**
 * Reveal delay (ms from board entry) for a slot. All step cubes reveal together
 * at 0 so the full roadmap is visible before progress begins; subtask cubes
 * stream in afterwards, staggered in their own order.
 */
function slotRevealDelay(slots: CubeSlot[], index: number): number {
  const slot = slots[index];
  if (!slot || slot.kind === "step") return 0;
  let subtaskOrder = 0;
  for (let k = 0; k < index; k++) {
    if (slots[k]?.kind === "subtask") subtaskOrder += 1;
  }
  return PLAN_SUBTASK_REVEAL_BASE_MS + subtaskOrder * PLAN_STAGGER_MS;
}

interface CubePersonality {
  /** Which of the 8 frequency bands primarily drives this cube. */
  bandIndex: number;
  /** Stable 0–1 multiplier — makes cubes in the same band spread differently. */
  seed: number;
  /**
   * Phase lag offset (0–1). Subtracts from band energy so the cube starts
   * reacting slightly after the dominant cubes in its band.
   */
  phaseOffset: number;
}

// ─── TesseractVisual ────────────────────────────────────────────────────────

interface TesseractVisualProps {
  /** Called after first render — signals the welcome layer the animation is live. */
  onReady?: () => void;
  /**
   * When true, uses container-relative centering (50%) instead of viewport-relative
   * positioning. Use when embedding inside a panel rather than full-screen.
   */
  compact?: boolean;
  /**
   * When set, amplitude/bands/playback rate are driven imperatively from the voice
   * session (no React re-renders per analyser tick).
   */
  voiceDriveRef?: MutableRefObject<VoiceTesseractDrive>;
  /**
   * Animation playback rate multiplier applied to all CSS animations via the
   * Web Animations API. Used when {@link voiceDriveRef} is not provided (welcome splash).
   */
  playbackRate?: number;
  /**
   * 8 normalised frequency band energies (0–1) from the mic analyser.
   * Ignored when {@link voiceDriveRef} is provided.
   */
  frequencyBands?: number[];
  /**
   * When true (e.g. Exo with mic off), cube face borders use the theme error color instead of accent.
   * Welcome splash leaves this false.
   */
  micMuted?: boolean;
  /** When true (voice session reconnecting), cube borders match the RECONNECTING status color. */
  reconnecting?: boolean;
  /**
   * When true, plays the one-shot `tv-intro-fade` animation on the content block.
   * Set this at the moment the Exo panel is first unveiled so the tesseract fades in
   * before the surrounding chrome slides in.
   */
  introActive?: boolean;
  /**
   * Called when the intro fade animation ends (or immediately for reduced-motion users).
   * Parent uses this to trigger the panel slide-in instead of a hard-coded timer.
   */
  onIntroComplete?: () => void;
  /**
   * When true (WORKING or THINKING), connecting lines draw between adjacent cubes
   * and dots travel along those lines.
   */
  isActive?: boolean;
  /**
   * Layout mode. "idle" is the ambient tesseract (default). "plan" morphs the
   * cubes into a labeled board: a row of large step cubes, each with a column of
   * smaller subtask cubes beneath, reflecting {@link plan}.
   */
  layout?: "idle" | "plan";
  /** Plan descriptor driving the "plan" layout. Ignored in idle mode. */
  plan?: TesseractPlan | null;
  /** Live plan phase — enables travel-cube pulses on the step row while planning. */
  planPhase?: PlanBoardPhase | null;
  /**
   * When true, pause RAF loops and CSS animations (Exo off-tab or browser tab hidden).
   * Saves GPU/CPU while the panel stays mounted for Web Audio reliability.
   */
  animationSuspended?: boolean;
}

const TesseractVisual: React.FC<TesseractVisualProps> = ({
  onReady,
  compact = false,
  voiceDriveRef,
  playbackRate = 1,
  frequencyBands,
  micMuted = false,
  reconnecting = false,
  introActive = false,
  onIntroComplete,
  isActive = false,
  layout = "idle",
  plan = null,
  planPhase = null,
  animationSuspended = false,
}) => {
  const { t } = useI18n();
  const pageHidden = useDocumentPageHidden();
  const suspendAnimation = animationSuspended || pageHidden;
  const planMode = layout === "plan" && !!plan && plan.steps.length > 0;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onIntroCompleteRef = useRef(onIntroComplete);
  onIntroCompleteRef.current = onIntroComplete;

  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sceneContainerRef = useRef<HTMLDivElement>(null);
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;

  const smoothedPlaybackRateRef = useRef(playbackRate);
  const lastAppliedPlaybackRef = useRef({ value: playbackRate });

  // Keep a ref to frequencyBands so the RAF loop reads the latest value
  // without needing to be recreated when it changes (welcome splash only).
  const frequencyBandsRef = useRef<number[]>(frequencyBands ?? Array(FREQ_BAND_COUNT).fill(0));
  if (!voiceDriveRef) {
    frequencyBandsRef.current = frequencyBands ?? Array(FREQ_BAND_COUNT).fill(0);
  }

  /** Low-pass smoothed band energies (updated in RAF). */
  const smoothedBandsRef = useRef<number[]>(Array(FREQ_BAND_COUNT).fill(0));
  /** Low-pass smoothed voice excursion per cube (px). */
  const smoothedExcursionRef = useRef<number[]>(Array(CUBE_COUNT).fill(0));
  /** When true, voice-driven spread is disabled (idle breathing only). */
  const reduceMotionRef = useRef(false);

  const [cubeSize, setCubeSize] = useState(40);
  const [containerSize, setContainerSize] = useState({ width: 480, height: 320 });

  // Plan-mode cube board: ordered slots (steps then subtasks) with target positions.
  const planBoard = useMemo(
    () =>
      planMode && plan
        ? buildPlanBoardLayout(plan, containerSize.width, containerSize.height)
        : null,
    [planMode, plan, containerSize.width, containerSize.height],
  );
  const planSlots = planBoard?.slots ?? [];
  const planMetrics = planBoard?.metrics;
  const [focusedStepIndex, setFocusedStepIndex] = useState<number | null>(null);
  const focusedStepRef = useRef<number | null>(null);
  const planBoardRef = useRef<HTMLDivElement | null>(null);
  const viewportTransformRef = useRef<PlanViewportTransform>({ translateX: 0, translateY: 0, scale: 1 });
  focusedStepRef.current = focusedStepIndex;
  const stableTargets = useMemo(() => planSlotTargets(planSlots), [planSlots]);

  const columnHitZones = useMemo(() => {
    if (!planMode || !plan || !planMetrics || planSlots.length === 0) return [];
    return plan.steps
      .map((step) => {
        const bounds = computePlanColumnBounds(
          planSlots,
          stableTargets,
          step.index,
          planMetrics.labelMaxWidth,
        );
        return bounds ? { stepIndex: step.index, bounds } : null;
      })
      .filter(
        (z): z is { stepIndex: number; bounds: NonNullable<ReturnType<typeof computePlanColumnBounds>> } =>
          z !== null,
      );
  }, [planMode, plan, planMetrics, planSlots, stableTargets]);

  const columnPointerTargets = useMemo<PlanColumnPointerTarget[]>(
    () =>
      columnHitZones.map(({ stepIndex, bounds }) => ({
        stepIndex,
        centerX: bounds.centerX,
        bounds,
      })),
    [columnHitZones],
  );

  const clearZoom = useCallback(() => {
    setFocusedStepIndex(null);
  }, []);

  const uniformFocusScale = useMemo(() => {
    if (!planMode || columnHitZones.length === 0) return 1;
    return computeUniformPlanFocusScale(
      columnHitZones.map((zone) => zone.bounds),
      containerSize.width,
      containerSize.height,
      { maxScale: 1.88, padding: 36 },
    );
  }, [planMode, columnHitZones, containerSize.width, containerSize.height]);

  const focusTransform = useMemo(() => {
    if (!planMode || focusedStepIndex == null || !planMetrics || planSlots.length === 0) {
      return { scale: 1, translateX: 0, translateY: 0 };
    }
    const bounds = computePlanColumnBounds(
      planSlots,
      stableTargets,
      focusedStepIndex,
      planMetrics.labelMaxWidth,
    );
    if (!bounds) return { scale: 1, translateX: 0, translateY: 0 };
    return computePlanFocusTransformWithScale(bounds, uniformFocusScale);
  }, [
    planMode,
    focusedStepIndex,
    planMetrics,
    planSlots,
    stableTargets,
    uniformFocusScale,
  ]);

  const boardScale = planMetrics?.boardScale ?? 1;

  const viewportTransformState = useMemo(
    () => resolvePlanViewportTransform(planMode, focusedStepIndex, boardScale, focusTransform),
    [planMode, focusedStepIndex, boardScale, focusTransform],
  );
  viewportTransformRef.current = viewportTransformState;

  const viewportTransformCss = useMemo(() => {
    if (!planMode) return "none";
    const { translateX, translateY, scale } = viewportTransformState;
    if (focusedStepIndex == null) return `scale(${scale})`;
    return `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  }, [planMode, focusedStepIndex, viewportTransformState]);

  const resolveStepFromClientPoint = useCallback(
    (clientX: number, clientY: number): number | null => {
      const container = sceneContainerRef.current;
      if (!container || columnPointerTargets.length === 0) return null;
      const layout = clientToPlanLayoutPoint(
        clientX,
        clientY,
        container.getBoundingClientRect(),
        viewportTransformRef.current,
      );
      return resolvePlanStepFromPointer(layout.x, columnPointerTargets);
    },
    [columnPointerTargets],
  );

  const handlePlanPointerClick = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (focusedStepRef.current != null) {
        clearZoom();
        return;
      }
      const stepIndex = resolveStepFromClientPoint(event.clientX, event.clientY);
      if (stepIndex != null) setFocusedStepIndex(stepIndex);
    },
    [clearZoom, resolveStepFromClientPoint],
  );

  const focusedStepCopy = useMemo(
    () => (focusedStepIndex != null ? stepFocusCopy(planSlots, focusedStepIndex) : null),
    [focusedStepIndex, planSlots],
  );

  /** Animated render state for plan mode: position + opacity per cube (RAF-owned). */
  const planRenderRef = useRef<{ pos: Vec3; opacity: number }[]>([]);
  const planSlotsRef = useRef<CubeSlot[]>(planSlots);
  planSlotsRef.current = planSlots;
  /** Per-slot reveal start (ms) — stable across step status updates. */
  const slotRevealAtRef = useRef<Map<number, number>>(new Map());
  const cubeOffsetsRef = useRef<Vec3[]>([]);
  const planCubeNodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const planLineRefs = useRef<(ConnectionLineHandle | null)[]>([]);

  // Idle-mode imperative targets: the RAF writes transforms straight to these
  // DOM nodes instead of calling setState every frame (no per-frame re-render).
  const idleCubeNodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const idleLineRefs = useRef<(ConnectionLineHandle | null)[]>([]);

  // Per-cube { x, y, z } offsets — only the INITIAL layout for first paint; the
  // idle RAF loop below then drives positions imperatively via refs (no setState).
  const [cubeOffsets] = useState<Vec3[]>(() =>
    Array.from({ length: CUBE_COUNT }, (_, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3) % 3;
      const layer = Math.floor(i / 9);
      const s = 56; // initial compact spacing
      return { x: (col - 1) * s, y: (row - 1) * s, z: (layer - 1) * s };
    }),
  );

  // Stable per-cube personalities — assigned once at mount, never change.
  const cubePersonalities = useMemo<CubePersonality[]>(
    () =>
      Array.from({ length: CUBE_COUNT }, (_, i) => ({
        bandIndex: i % FREQ_BAND_COUNT,
        seed: deterministicRandom(i),
        phaseOffset: deterministicRandom(i + CUBE_COUNT),
      })),
    [],
  );

  // Stable list of axis-aligned neighbour pairs (one step in exactly one axis).
  // ~28% of pairs are excluded deterministically so the grid looks sparse and
  // interesting rather than fully connected.
  const neighborPairs = useMemo(() => {
    const pairs: { a: number; b: number; axis: "x" | "y" | "z" }[] = [];
    for (let i = 0; i < CUBE_COUNT; i++) {
      for (let j = i + 1; j < CUBE_COUNT; j++) {
        const dCol   = Math.abs((i % 3)                - (j % 3));
        const dRow   = Math.abs((Math.floor(i / 3) % 3) - (Math.floor(j / 3) % 3));
        const dLayer = Math.abs(Math.floor(i / 9)      - Math.floor(j / 9));
        if (dCol + dRow + dLayer === 1) {
          // Keep ~40% of pairs for a sparse, intentional-looking network
          if (deterministicRandom(i * 31 + j * 17 + 5) < 0.40) {
            pairs.push({ a: i, b: j, axis: dCol ? "x" : dRow ? "y" : "z" });
          }
        }
      }
    }
    return pairs;
  }, []);
  const neighborPairsRef = useRef(neighborPairs);
  neighborPairsRef.current = neighborPairs;

  // Plan-mode connections: step row (consecutive steps) + each step's subtask
  // spine. Index references match buildPlanSlots ordering (steps, then subtasks
  // grouped per step).
  const planConnections = useMemo<{ a: number; b: number }[]>(
    () => (planMode && plan ? buildPlanConnections(plan) : []),
    [planMode, plan],
  );

  // Step status keyed by step index — lets connection lines tell whether a
  // subtask's owning step is currently running (so its spine animates).
  const stepStatusByIndex = useMemo<Map<number, CubeStatusVisual>>(() => {
    const map = new Map<number, CubeStatusVisual>();
    if (planMode && plan) {
      for (const step of plan.steps) map.set(step.index, step.status);
    }
    return map;
  }, [planMode, plan]);

  const planConnectionsRef = useRef(planConnections);
  planConnectionsRef.current = planConnections;

  const planPoolSize = planMode ? Math.max(CUBE_COUNT, planSlots.length) : 0;

  // Fire onReady after first paint.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => onReadyRef.current?.());
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Fire onIntroComplete when all cubes have completed their first breathing cycle.
  // For prefers-reduced-motion users (no animations) fire immediately.
  useEffect(() => {
    if (!introActive) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onIntroCompleteRef.current?.();
      return;
    }

    const id = window.setTimeout(() => {
      onIntroCompleteRef.current?.();
    }, TESSERACT_LAUNCH_COMPLETE_MS);
    return () => window.clearTimeout(id);
  }, [introActive]);

  // Apply playback rate to CSS animations when not voice-driven (welcome splash).
  useEffect(() => {
    if (voiceDriveRef) return;
    const root = rootRef.current;
    if (!root) return;
    applyCssAnimationPlaybackRate(root, playbackRate, lastAppliedPlaybackRef.current);
  }, [playbackRate, voiceDriveRef]);

  // Responsive cube sizing + plan-board container measurement (column width, not window).
  useEffect(() => {
    const updateCubeSize = () => {
      const w = window.innerWidth;
      setCubeSize(w < 480 ? 14 : w < 768 ? 18 : 24);
    };
    updateCubeSize();
    window.addEventListener("resize", updateCubeSize);
    return () => window.removeEventListener("resize", updateCubeSize);
  }, []);

  useEffect(() => {
    const el = sceneContainerRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setContainerSize({ width: Math.round(width), height: Math.round(height) });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the latest idle offsets available so plan mode can morph *from* the
  // cubes' current positions rather than snapping.
  useEffect(() => {
    cubeOffsetsRef.current = cubeOffsets;
  }, [cubeOffsets]);

  // prefers-reduced-motion: skip voice-reactive spread, keep idle breathing only.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reduceMotionRef.current = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Per-cube offset RAF loop — idle breathing + smoothed, sparse voice spread.
  //
  // Idle: easeInOut breathing on all cubes (8 s period).
  // Voice: bands low-pass filtered; top ~7 cubes exceed threshold; band mapping rotates
  // in time + per-cube score wander so the same layout is not always active during speech.
  useEffect(() => {
    if (planMode) return;
    if (suspendAnimation) return; // paused while off-tab or document hidden
    const IDLE_HALF_CYCLE = 4000; // ms — 8 s full period, matching CSS tv-rotate
    const easeInOut = (t: number) =>
      t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    // Idle grid baseline (desktop vs mobile resolved inside tick)
    const BASE_MIN_DESKTOP = 40;
    const BASE_MAX_DESKTOP = 72;
    const BASE_MIN_MOBILE = 28;
    const BASE_MAX_MOBILE = 52;

    // Voice-reactive tuning — responsive to sound, with a quickly-rotating active set.
    /** Band low-pass: higher = snappier reaction to sound changes. */
    const BAND_SMOOTH_ALPHA = 0.24;
    /** <1 lifts quieter sound so the cubes react to normal speech, not just loud peaks. */
    const RAW_CURVE_EXPONENT = 1.0;
    /** Per-cube excursion low-pass: higher = cubes extend AND retract faster, so the
     *  moving set hands off quickly instead of one cube staying extended too long. */
    const EXCURSION_SMOOTH_ALPHA = 0.2;
    /** At most this many cubes get meaningful spread at once (threshold = (K+1)th largest score). */
    const MAX_ACTIVE_CUBES = 9;
    /** Max extra px spread. */
    const MAX_EXCURSION = 84;
    const PHASE_GATE = 0.12;
    /** Cyclically shifts which band each cube follows so the active set keeps changing
     *  during long speech — lower = the moving cubes swap faster. */
    const BAND_ROTATE_MS = 1300;
    /** Modulation of per-cube scores so top-K selection drifts over time (rad/ms). */
    const SCORE_WANDER_SPEED = 0.0021;

    let virtualMs = 0;
    let last = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const drive = voiceDriveRef?.current;
      if (drive) {
        smoothedPlaybackRateRef.current = stepSmoothedPlaybackRate(
          smoothedPlaybackRateRef.current,
          drive.voiceStatus,
          drive.metrics.amplitude,
          drive.outputTranscript,
          drive.landBlend,
          drive.introPlaybackRate,
        );
        playbackRateRef.current = smoothedPlaybackRateRef.current;
        const root = rootRef.current;
        if (root) {
          applyCssAnimationPlaybackRate(
            root,
            smoothedPlaybackRateRef.current,
            lastAppliedPlaybackRef.current,
          );
        }
      }

      const dt = now - last;
      last = now;
      virtualMs += dt * Math.max(0.05, playbackRateRef.current);

      const desktop = window.innerWidth >= 769;
      const baseMin = desktop ? BASE_MIN_DESKTOP : BASE_MIN_MOBILE;
      const baseMax = desktop ? BASE_MAX_DESKTOP : BASE_MAX_MOBILE;

      // Idle breathing baseline — same rhythm as CSS rotation
      const progress = (virtualMs % (IDLE_HALF_CYCLE * 2)) / IDLE_HALF_CYCLE;
      const eased = progress < 1 ? easeInOut(progress) : 1 - easeInOut(progress - 1);
      const idleSpacing = baseMin + (baseMax - baseMin) * eased;

      const rawBands = drive?.metrics.frequencyBands ?? frequencyBandsRef.current;
      const sBands = smoothedBandsRef.current;

      for (let k = 0; k < FREQ_BAND_COUNT; k++) {
        const shaped = Math.pow(Math.min(1, Math.max(0, rawBands[k] ?? 0)), RAW_CURVE_EXPONENT);
        sBands[k] += BAND_SMOOTH_ALPHA * (shaped - sBands[k]);
      }

      const voiceOff = reduceMotionRef.current;
      const targetExc = new Array<number>(CUBE_COUNT);

      if (voiceOff) {
        for (let i = 0; i < CUBE_COUNT; i++) targetExc[i] = 0;
      } else {
        const bandPhase = Math.floor(virtualMs / BAND_ROTATE_MS) % FREQ_BAND_COUNT;
        const scores = cubePersonalities.map((p, i) => {
          const rotatedBand = (p.bandIndex + bandPhase) % FREQ_BAND_COUNT;
          const band = sBands[rotatedBand] ?? 0;
          const lagged = Math.max(0, band - p.phaseOffset * PHASE_GATE);
          const wander =
            0.55 + 0.45 * Math.sin(virtualMs * SCORE_WANDER_SPEED + i * 1.13 + p.seed * 4.283);
          return lagged * (0.5 + p.seed) * wander;
        });
        const sorted = [...scores].sort((a, b) => b - a);
        const thIdx = Math.min(MAX_ACTIVE_CUBES, Math.max(0, sorted.length - 1));
        const threshold = sorted[thIdx] ?? 0;
        for (let i = 0; i < CUBE_COUNT; i++) {
          const gap = Math.max(0, scores[i] - threshold);
          const p = cubePersonalities[i];
          targetExc[i] = gap * MAX_EXCURSION * (0.6 + p.seed * 0.8);
        }
      }

      const smoothedExc = smoothedExcursionRef.current;
      const offsets: Vec3[] = cubePersonalities.map((_, i) => {
        smoothedExc[i] += EXCURSION_SMOOTH_ALPHA * (targetExc[i] - smoothedExc[i]);
        const s = idleSpacing + smoothedExc[i];
        const col = i % 3;
        const row = Math.floor(i / 3) % 3;
        const layer = Math.floor(i / 9);
        return { x: (col - 1) * s, y: (row - 1) * s, z: (layer - 1) * s };
      });

      // Write transforms directly to the DOM — no React re-render this frame.
      for (let i = 0; i < offsets.length; i++) {
        const node = idleCubeNodeRefs.current[i];
        if (node) node.style.transform = cubeTransform(offsets[i]);
      }
      // Keep the latest offsets available so plan mode can morph *from* the
      // cubes' current positions (previously synced via a state effect).
      cubeOffsetsRef.current = offsets;
      // Re-point any active connection lines (only present while isActive).
      const lines = idleLineRefs.current;
      for (let idx = 0; idx < neighborPairsRef.current.length; idx++) {
        const pair = neighborPairsRef.current[idx];
        lines[idx]?.setEndpoints(offsets[pair.a], offsets[pair.b]);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // cubePersonalities is stable (useMemo with no deps) — safe to include.
  }, [cubePersonalities, planMode, voiceDriveRef, suspendAnimation]);

  // ── Plan-mode RAF: morph cubes into the labeled step/subtask board ──────────
  // Targets are read from planSlotsRef each frame so step status updates do not
  // restart the animation loop or reset stagger timing.
  useEffect(() => {
    if (!planMode) return;
    if (suspendAnimation) return;

    const reduceMotion = reduceMotionRef.current;
    const exitTarget = (i: number): Vec3 => ({
      x: (i % 2 === 0 ? 1 : -1) * 1500,
      y: ((i * 53) % 420) - 210,
      z: 0,
    });

    const slots = planSlotsRef.current;
    const slotCount = slots.length;
    const poolSize = Math.max(CUBE_COUNT, slotCount);
    const idle = cubeOffsetsRef.current;
    const enteredAt = performance.now();

    if (planRenderRef.current.length === 0) {
      const seeded: { pos: Vec3; opacity: number }[] = Array.from({ length: poolSize }, (_, i) => {
        if (idle[i]) return { pos: { ...idle[i] }, opacity: 1 };
        return { pos: { x: 0, y: -360, z: 0 }, opacity: 0 };
      });
      planRenderRef.current = seeded;
      for (let i = 0; i < slotCount; i++) {
        slotRevealAtRef.current.set(i, enteredAt + slotRevealDelay(slots, i));
      }
    }

    let raf: number;
    const tick = () => {
      const slotsNow = planSlotsRef.current;
      const count = slotsNow.length;
      const pool = Math.max(CUBE_COUNT, count);
      const now = performance.now();
      const cur = planRenderRef.current;
      const focused = focusedStepRef.current;

      if (cur.length < pool) {
        for (let i = cur.length; i < pool; i++) {
          const idlePos = cubeOffsetsRef.current[i];
          cur.push(
            idlePos
              ? { pos: { ...idlePos }, opacity: 1 }
              : { pos: { x: 0, y: -360, z: 0 }, opacity: 0 },
          );
        }
      }

      for (let i = 0; i < count; i++) {
        if (!slotRevealAtRef.current.has(i)) {
          slotRevealAtRef.current.set(i, now + slotRevealDelay(slotsNow, i));
        }
      }

      for (let i = 0; i < pool; i++) {
        const isSlot = i < count;
        const target = isSlot ? slotsNow[i].target : exitTarget(i);
        const targetOp = isSlot ? 1 : 0;
        const revealStart = slotRevealAtRef.current.get(i) ?? now;
        const reveal = isSlot
          ? Math.min(1, Math.max(0, (now - revealStart) / PLAN_REVEAL_MS))
          : 1;
        const cube = cur[i];
        if (reduceMotion) {
          cube.pos = { ...target };
          cube.opacity = targetOp;
        } else {
          const alpha = PLAN_POS_ALPHA * reveal;
          const opAlpha = PLAN_OP_ALPHA * reveal;
          cube.pos = {
            x: cube.pos.x + (target.x - cube.pos.x) * alpha,
            y: cube.pos.y + (target.y - cube.pos.y) * alpha,
            z: cube.pos.z + (target.z - cube.pos.z) * alpha,
          };
          cube.opacity = cube.opacity + (targetOp - cube.opacity) * opAlpha;
        }
        applyPlanCubeDom(planCubeNodeRefs.current[i], cube, slotsNow[i], focused);
      }

      const connections = planConnectionsRef.current;
      for (let idx = 0; idx < connections.length; idx++) {
        const { a, b } = connections[idx];
        const line = planLineRefs.current[idx];
        const cubeA = cur[a];
        const cubeB = cur[b];
        if (!line || !cubeA || !cubeB) continue;
        const slotA = slotsNow[a];
        const slotB = slotsNow[b];
        const columnActive =
          focused == null ||
          slotA?.stepIndex === focused ||
          slotB?.stepIndex === focused;
        line.setVisible(columnActive);
        if (columnActive) {
          line.setEndpoints(cubeA.pos, cubeB.pos);
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [planMode, suspendAnimation]);

  useEffect(() => {
    if (!planMode) setFocusedStepIndex(null);
  }, [planMode]);

  useEffect(() => {
    if (!planMode || focusedStepIndex == null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearZoom();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [planMode, focusedStepIndex, clearZoom]);

  // Reset plan render state when leaving plan mode so the next plan morphs fresh.
  useEffect(() => {
    if (!planMode) {
      planRenderRef.current = [];
      slotRevealAtRef.current.clear();
      planCubeNodeRefs.current = [];
      planLineRefs.current = [];
    }
  }, [planMode]);

  return (
    <div
      className={`tv-root${micMuted ? " tv-root--mic-muted" : ""}${reconnecting ? " tv-root--reconnecting" : ""}${suspendAnimation ? " tv-root--animation-suspended" : ""}`}
      ref={rootRef}
    >
      <div
        ref={contentRef}
        className={`tv-content${introActive ? " tv-content--intro" : ""}${planMode ? " tv-content--plan" : ""}`}
        style={compact ? { top: "50%", transform: "translate(-50%, -50%)" } : undefined}
      >
        <div className="tv-wordmark">
          <div className="tv-wordmark-row">
            <WordmarkWingPair />
            <div className="tv-wordmark-core">
              <div className="tv-word-container">
                <span className="tv-label tv-label--brand">EXOSITES</span>
                <span className="tv-label tv-label--studio">STUDIO</span>
              </div>
              <div className="tv-tagline">{t("assistant.exoTagline")}</div>
            </div>
            <WordmarkWingPair />
          </div>
        </div>

        <div
          ref={sceneContainerRef}
          className={`tv-scene-container${planMode ? " tv-scene-container--plan tv-scene-container--plan-interactive" : ""}${focusedStepIndex != null ? " tv-scene-container--plan-focused" : ""}`}
          onClick={planMode ? handlePlanPointerClick : undefined}
        >
          <div ref={planBoardRef} className="tv-plan-board">
            <div
              className={`tv-plan-viewport${focusedStepIndex != null ? " tv-plan-viewport--focused" : ""}`}
              style={{ transform: viewportTransformCss }}
            >
              <div className={`tv-scene${planMode ? " tv-scene--plan" : ""}`}>
            {!planMode &&
              cubeOffsets.map((pos, i) => (
                <Cube
                  key={i}
                  ref={(el) => {
                    idleCubeNodeRefs.current[i] = el;
                  }}
                  position={pos}
                  size={cubeSize}
                  delay={i * 0.05}
                />
              ))}
            {!planMode &&
              isActive &&
              neighborPairs.map(({ a, b }, idx) => (
                <ConnectionLine
                  key={idx}
                  ref={(h) => {
                    idleLineRefs.current[idx] = h;
                  }}
                  posA={cubeOffsets[a]}
                  posB={cubeOffsets[b]}
                  pairIndex={idx}
                />
              ))}

            {planMode &&
              Array.from({ length: planPoolSize }, (_, i) => {
                const slot = planSlots[i];
                const columnActive =
                  focusedStepIndex == null || slot?.stepIndex === focusedStepIndex;
                const seed = planRenderRef.current[i];
                return (
                  <Cube
                    key={i}
                    ref={(el) => {
                      planCubeNodeRefs.current[i] = el;
                    }}
                    position={seed?.pos ?? { x: 0, y: -360, z: 0 }}
                    size={slot ? slot.size : PLAN_SUB_CUBE}
                    delay={0}
                    noFloat
                    opacity={(seed?.opacity ?? 0) * (columnActive ? 1 : 0.22)}
                    status={slot ? slot.status : undefined}
                    dimmed={!columnActive}
                  />
                );
              })}
            {planMode &&
              planConnections.map(({ a, b }, idx) => {
                const slotA = planSlots[a];
                const slotB = planSlots[b];
                const posA = planRenderRef.current[a]?.pos ?? { x: 0, y: 0, z: 0 };
                const posB = planRenderRef.current[b]?.pos ?? { x: 0, y: 0, z: 0 };
                return (
                  <ConnectionLine
                    key={`pc-${idx}`}
                    ref={(h) => {
                      planLineRefs.current[idx] = h;
                    }}
                    posA={posA}
                    posB={posB}
                    pairIndex={idx}
                    showTravelCube={shouldShowPlanTravelCube(
                      slotA,
                      slotB,
                      stepStatusByIndex,
                      planPhase,
                    )}
                  />
                );
              })}
              </div>

              {planMode && focusedStepIndex != null && (
                <div className="tv-plan-labels tv-plan-labels--focused" aria-hidden="true">
                  {planSlots.map((slot) => {
                    if (!slot.label.trim()) return null;
                    if (slot.stepIndex !== focusedStepIndex) return null;

                    if (slot.kind === "step") {
                      const labelX = Math.round(slot.target.x);
                      const labelY = Math.round(slot.target.y - slot.size / 2 - 8);
                      const transform = `translate(-50%, -100%) translate(${labelX}px, ${labelY}px)`;
                      return (
                        <div
                          key={`focus-step-${slot.stepIndex}`}
                          className={`tv-plan-label tv-plan-label--focused tv-plan-label--step tv-plan-label--${slot.status}`}
                          style={{ transform }}
                        >
                          {slot.label}
                        </div>
                      );
                    }

                    const labelX = Math.round(slot.target.x - slot.size / 2 - 10);
                    const labelY = Math.round(slot.target.y);
                    const transform = `translate(-100%, -50%) translate(${labelX}px, ${labelY}px)`;
                    return (
                      <div
                        key={`focus-sub-${slot.stepIndex}-${slot.subIndex}`}
                        className={`tv-plan-label tv-plan-label--focused tv-plan-label--sub tv-plan-label--${slot.status}`}
                        style={{ transform }}
                        title={slot.label}
                      >
                        {slot.label}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {planMode && (
              <div className="tv-plan-hit-layer" aria-hidden="true">
                {columnHitZones.map(({ stepIndex, bounds }) => (
                  <div
                    key={`hit-${stepIndex}`}
                    className={`tv-plan-column-hit${focusedStepIndex === stepIndex ? " tv-plan-column-hit--active" : ""}`}
                    style={{
                      left: `calc(50% + ${bounds.minX * boardScale}px)`,
                      top: `calc(50% + ${bounds.minY * boardScale}px)`,
                      width: bounds.width * boardScale,
                      height: bounds.height * boardScale,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {planMode && focusedStepIndex == null && (
            <div className="tv-plan-labels tv-plan-labels--overview" aria-hidden="true">
              {planSlots.map((slot) => {
                if (slot.kind !== "step" || !slot.label.trim()) return null;
                const labelX = Math.round(slot.target.x * boardScale);
                const labelY = Math.round((slot.target.y - slot.size / 2 - 10) * boardScale);
                const transform = `translate(-50%, -100%) translate(${labelX}px, ${labelY}px)`;
                return (
                  <div
                    key={`overview-${slot.stepIndex}`}
                    className={`tv-plan-label tv-plan-label--overview tv-plan-label--${slot.status}`}
                    style={{ transform }}
                  >
                    {slot.label}
                  </div>
                );
              })}
            </div>
          )}

          {planMode && focusedStepCopy && plan && focusedStepIndex != null && (
            <PlanFocusCallout
              stepPosition={Math.max(1, plan.steps.findIndex((s) => s.index === focusedStepIndex) + 1)}
              stepTotal={plan.steps.length}
              shortTitle={focusedStepCopy.shortTitle}
              detail={focusedStepCopy.detail}
              stepStatus={plan.steps.find((s) => s.index === focusedStepIndex)?.status ?? "pending"}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default TesseractVisual;
