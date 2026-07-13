import {
  useLayoutEffect,
  useState,
  useEffect,
  useRef,
  useMemo,
  useId,
  type CSSProperties,
} from "react";
import { useI18n } from "../i18n/I18nContext";
import type { MainNavTab } from "../hooks/useMainNavItems";
import {
  buildProductTourStepMeta,
  type ProductTourStepMeta,
} from "../i18n/productTourSteps";

/** Must align with primary nav tabs so the tour can highlight steps while any tab is active. */
type TourTab = MainNavTab;

type TourStepConfig = ProductTourStepMeta & {
  title: string;
  body: string;
};

function buildTourSteps(
  t: (key: string) => string,
  stepMeta: ProductTourStepMeta[],
): TourStepConfig[] {
  return stepMeta.map((m) => ({
    ...m,
    title: t(`tour.step.${m.id}.title`),
    body: t(`tour.step.${m.id}.body`),
  }));
}

/** Outset from `[data-tour]` bounds → hole size (tour indicator layer only). */
const HOLE_PADDING = 4;
/** Max corner radius for the hole; actual rx is clamped to hole width/height. */
const HOLE_RX_MAX = 12;
const HOLE_DIM_RGBA = "rgba(10, 12, 18, 0.48)";
/** `feGaussianBlur` stdDeviation — larger = softer transition overlay ↔ hole. */
const HOLE_FEATHER_BLUR_STD = 5;
/** Filter region expansion (px) so the blur is not clipped. */
const HOLE_FEATHER_FILTER_PAD = 56;

/** Viewport margin for tour card (px). */
const CARD_MARGIN = 16;
/** Treat highlight as “large” → dock card at bottom so it stays in frame (modals, tall settings). */
const LARGE_TARGET_H_FRAC = 0.48;
const LARGE_TARGET_W_FRAC = 0.76;
const LARGE_TARGET_AREA_FRAC = 0.38;
/** Max height for docked / scrollable tour card. */
const CARD_MAX_HEIGHT_FRAC = 0.44;
const CARD_MAX_HEIGHT_CAP = 400;
/** Typical card height for placement math when not measured yet. */
const CARD_PLACEHOLDER_EST = 268;

/** Prefer layout viewport size (matches painted client area; avoids thin gaps vs innerWidth/innerHeight). */
function layoutViewportSize(): { vw: number; vh: number } {
  const d = document.documentElement;
  return {
    vw: d.clientWidth || window.innerWidth,
    vh: d.clientHeight || window.innerHeight,
  };
}

/** Scroll-margin while scrolling so the target isn’t glued to the viewport edge (esp. bottom). */
const SCROLL_INTO_VIEW_MARGIN_PX = 72;

/**
 * Scroll target into a comfortable view. Uses `center` (not `nearest`) so short elements near the
 * bottom of a long page actually scroll into view; repeat + rAF helps nested overflow panes (Settings).
 */
function scrollTargetIntoView(el: Element) {
  const opts: ScrollIntoViewOptions = {
    behavior: "auto",
    block: "center",
    inline: "nearest",
  };
  if (el instanceof HTMLElement) {
    const prevTop = el.style.scrollMarginTop;
    const prevBottom = el.style.scrollMarginBottom;
    const m = `${SCROLL_INTO_VIEW_MARGIN_PX}px`;
    el.style.scrollMarginTop = m;
    el.style.scrollMarginBottom = m;
    try {
      el.scrollIntoView(opts);
      el.scrollIntoView(opts);
    } finally {
      el.style.scrollMarginTop = prevTop;
      el.style.scrollMarginBottom = prevBottom;
    }
  } else {
    el.scrollIntoView(opts);
    el.scrollIntoView(opts);
  }
}

function isLargeHighlightRect(r: DOMRect, vw: number, vh: number): boolean {
  const area = r.width * r.height;
  const vArea = vw * vh;
  return (
    r.height >= vh * LARGE_TARGET_H_FRAC ||
    r.width >= vw * LARGE_TARGET_W_FRAC ||
    (vArea > 0 && area >= vArea * LARGE_TARGET_AREA_FRAC)
  );
}

function computeTourCardStyle(r: DOMRect, vw: number, vh: number): CSSProperties {
  const dockMaxH = Math.min(vh * CARD_MAX_HEIGHT_FRAC, CARD_MAX_HEIGHT_CAP);
  const cardW = Math.min(420, vw - CARD_MARGIN * 2);

  if (isLargeHighlightRect(r, vw, vh)) {
    return {
      position: "fixed",
      left: CARD_MARGIN,
      right: CARD_MARGIN,
      bottom: CARD_MARGIN,
      top: "auto",
      width: "auto",
      maxWidth: cardW,
      marginLeft: "auto",
      marginRight: "auto",
      maxHeight: dockMaxH,
      transform: "none",
      zIndex: 320,
    };
  }

  let left = r.left + r.width / 2 - cardW / 2;
  left = Math.max(CARD_MARGIN, Math.min(left, vw - cardW - CARD_MARGIN));

  const spaceBelow = vh - r.bottom - CARD_MARGIN;
  const spaceAbove = r.top - CARD_MARGIN;
  const estH = Math.min(CARD_PLACEHOLDER_EST, dockMaxH);
  const placeBelow = spaceBelow > 160 || r.top < vh * 0.22;
  const needDock =
    spaceBelow < estH + 8 && spaceAbove < estH + 8
      ? true
      : placeBelow
        ? r.bottom + HOLE_PADDING + 16 + estH > vh - CARD_MARGIN
        : r.top - HOLE_PADDING - 16 - estH < CARD_MARGIN;

  if (needDock) {
    return {
      position: "fixed",
      left: CARD_MARGIN,
      right: CARD_MARGIN,
      bottom: CARD_MARGIN,
      top: "auto",
      width: "auto",
      maxWidth: cardW,
      marginLeft: "auto",
      marginRight: "auto",
      maxHeight: dockMaxH,
      transform: "none",
      zIndex: 320,
    };
  }

  let top: number;
  if (placeBelow) {
    top = r.bottom + HOLE_PADDING + 16;
  } else {
    top = r.top - HOLE_PADDING - 16 - estH;
  }
  top = Math.max(CARD_MARGIN, Math.min(top, vh - dockMaxH - CARD_MARGIN));

  return {
    position: "fixed",
    left,
    top,
    maxWidth: "22rem",
    width: cardW,
    maxHeight: dockMaxH,
    transform: "none",
    zIndex: 320,
  };
}

/** Keep spotlight hole on-screen when a section is taller than the viewport. */
function clampRectToViewport(r: DOMRect): DOMRect {
  const { vw, vh } = layoutViewportSize();
  const top = Math.max(r.top, 0);
  const left = Math.max(r.left, 0);
  const bottom = Math.min(r.bottom, vh);
  const right = Math.min(r.right, vw);
  const w = Math.max(0, right - left);
  const h = Math.max(0, bottom - top);
  if (w < 32 || h < 32) return r;
  return new DOMRect(left, top, w, h);
}

/**
 * Dim overlay with a feathered “hole” over the target. A plain box-shadow spread keeps a hard edge;
 * SVG mask + blurred cutout softens the overlay ↔ highlight boundary.
 */
function SpotlightLayers({
  rect,
  showHole,
  /** True when [data-tour] has been measured for this step (hole geometry is valid). */
  holeReady,
}: {
  rect: DOMRect | null;
  showHole: boolean;
  holeReady: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const blurFilterId = `tour-spot-blur-${uid}`;
  const spotMaskId = `tour-spot-mask-${uid}`;

  /* Intro / no target: full tint only — no backdrop-blur so the UI stays sharp. */
  if (!showHole) {
    return (
      <div
        className="fixed inset-0 z-[300] pointer-events-none bg-overlay-scrim-medium"
        aria-hidden
      />
    );
  }

  /* Target step but rect not ready yet (tab switch / layout): light tint, no blur. */
  if (!holeReady || !rect) {
    return (
      <div
        className="fixed inset-0 z-[300] pointer-events-none bg-overlay-scrim-light"
        aria-hidden
      />
    );
  }

  const { vw, vh } = layoutViewportSize();
  const x = rect.left - HOLE_PADDING;
  const y = rect.top - HOLE_PADDING;
  const w = rect.width + HOLE_PADDING * 2;
  const h = rect.height + HOLE_PADDING * 2;
  /** Avoid a bulky frame: radius never exceeds half the shorter side (pill/stadium for narrow bars). */
  const holeRx = Math.max(4, Math.min(HOLE_RX_MAX, w / 2, h / 2));
  const fp = HOLE_FEATHER_FILTER_PAD;
  const fx = x - fp;
  const fy = y - fp;
  const fw = w + fp * 2;
  const fh = h + fp * 2;

  return (
    <svg
      className="fixed inset-0 z-[300] h-full w-full pointer-events-none"
      viewBox={`0 0 ${vw} ${vh}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <filter
          id={blurFilterId}
          filterUnits="userSpaceOnUse"
          x={fx}
          y={fy}
          width={fw}
          height={fh}
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation={HOLE_FEATHER_BLUR_STD} />
        </filter>
        <mask
          id={spotMaskId}
          maskUnits="userSpaceOnUse"
          maskContentUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={vw}
          height={vh}
        >
          <rect x={0} y={0} width={vw} height={vh} fill="white" />
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={holeRx}
            ry={holeRx}
            fill="black"
            filter={`url(#${blurFilterId})`}
          />
        </mask>
      </defs>
      <rect x={0} y={0} width={vw} height={vh} fill={HOLE_DIM_RGBA} mask={`url(#${spotMaskId})`} />
    </svg>
  );
}

interface AppTourProps {
  open: boolean;
  stepIndex: number;
  onStepIndexChange: (n: number) => void;
  onClose: () => void;
  /** When true, local-model settings steps are omitted from the tour. */
  cloudSortActive: boolean;
  /** Current app tab — remeasure when it updates after navigation. */
  activeTab: TourTab;
  /** Direct tab switch (bypasses “unsaved settings” guards). */
  onNavigateTab: (tab: TourTab) => void;
  onComplete: () => void;
  /** Step id — remeasure after Settings expands a section. */
  tourLayoutKey: string;
}

export default function AppTour({
  open,
  stepIndex,
  onStepIndexChange,
  onClose,
  cloudSortActive,
  activeTab,
  onNavigateTab,
  onComplete,
  tourLayoutKey,
}: AppTourProps) {
  const { t } = useI18n();
  const stepMeta = useMemo(
    () => buildProductTourStepMeta(cloudSortActive),
    [cloudSortActive],
  );
  const steps = useMemo(() => buildTourSteps(t, stepMeta), [t, stepMeta]);

  useEffect(() => {
    if (stepIndex >= steps.length && steps.length > 0) {
      onStepIndexChange(steps.length - 1);
    }
  }, [stepIndex, steps.length, onStepIndexChange]);

  const [holeRect, setHoleRect] = useState<DOMRect | null>(null);
  const [cardStyle, setCardStyle] = useState<CSSProperties>(() => {
    const vh = typeof window !== "undefined" ? layoutViewportSize().vh : 800;
    return {
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      maxWidth: "22rem",
      width: "calc(100vw - 2rem)",
      maxHeight: Math.min(vh * CARD_MAX_HEIGHT_FRAC, CARD_MAX_HEIGHT_CAP),
    };
  });

  const step = steps[stepIndex];
  const hasTarget = Boolean(step?.targetSelector);
  const holeReady = Boolean(hasTarget && holeRect);
  const total = steps.length;

  const measureRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    if (!open) return;
    const s = steps[stepIndex];
    if (!s) return;

    if (s.tab && s.tab !== activeTab) {
      onNavigateTab(s.tab);
      return;
    }

    const run = () => {
      if (s.targetSelector) {
        setHoleRect(null);
      }
      const applyMeasure = () => {
        if (!s.targetSelector) {
          setHoleRect(null);
          const { vh } = layoutViewportSize();
          setCardStyle({
            left: "50%",
            bottom: "max(12%, 5rem)",
            transform: "translateX(-50%)",
            maxWidth: "22rem",
            width: "calc(100vw - 2rem)",
            maxHeight: Math.min(vh * CARD_MAX_HEIGHT_FRAC, CARD_MAX_HEIGHT_CAP),
            zIndex: 320,
          });
          return;
        }
        const el = document.querySelector(s.targetSelector!);
        if (!el) {
          setHoleRect(null);
          const { vh: vh0 } = layoutViewportSize();
          setCardStyle({
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            maxWidth: "22rem",
            width: "calc(100vw - 2rem)",
            maxHeight: Math.min(vh0 * CARD_MAX_HEIGHT_FRAC, CARD_MAX_HEIGHT_CAP),
            zIndex: 320,
          });
          return;
        }
        scrollTargetIntoView(el);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const raw = el.getBoundingClientRect();
            const r = clampRectToViewport(raw);
            setHoleRect(r);

            const { vw, vh } = layoutViewportSize();
            setCardStyle(computeTourCardStyle(r, vw, vh));
          });
        });
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(applyMeasure);
        });
      });
    };
    run();
    measureRef.current = run;
  }, [open, stepIndex, activeTab, onNavigateTab, tourLayoutKey, steps]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => measureRef.current?.();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onComplete();
        onClose();
        return;
      }

      const target = e.target as HTMLElement | null;
      const inTextField =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (inTextField) return;

      if (e.key === "ArrowLeft") {
        if (stepIndex <= 0) return;
        e.preventDefault();
        onStepIndexChange(stepIndex - 1);
        return;
      }

      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (stepIndex >= total - 1) {
          onComplete();
          onClose();
        } else {
          onStepIndexChange(stepIndex + 1);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, stepIndex, total, onStepIndexChange, onComplete, onClose]);

  if (!open || !step) return null;

  const isLast = stepIndex >= total - 1;

  const handleNext = () => {
    if (isLast) {
      onComplete();
      onClose();
    } else {
      onStepIndexChange(stepIndex + 1);
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) onStepIndexChange(stepIndex - 1);
  };

  const handleSkip = () => {
    onComplete();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[299]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <SpotlightLayers rect={holeRect} showHole={hasTarget} holeReady={holeReady} />

      <div
        className="fixed inset-0 z-[310] bg-transparent"
        style={{ pointerEvents: "auto" }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        aria-hidden
      />

      <div
        className="fixed z-[320] rounded-xl border border-border bg-bg-card shadow-accent-glow p-4 pointer-events-auto flex flex-col min-h-0 overflow-hidden"
        style={cardStyle}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex min-w-0 shrink-0 items-center gap-2">
          <p className="text-3xs font-bold uppercase tracking-widest text-muted shrink-0 whitespace-nowrap">
            Step {stepIndex + 1} of {total}
          </p>
          <div
            className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-0.5 overflow-x-auto [scrollbar-width:thin]"
            aria-hidden
            title={`${stepIndex + 1} / ${total}`}
          >
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                  i <= stepIndex ? "bg-accent" : "bg-border"
                }`}
              />
            ))}
          </div>
        </div>
        <h2 id="tour-title" className="text-base font-semibold text-text-primary mb-2 shrink-0">
          {step.title}
        </h2>
        <div className="text-sm text-muted leading-relaxed mb-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 -mr-0.5">
          {step.body}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 pt-1 border-t border-border-soft">
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs text-muted hover:text-text-primary underline underline-offset-2"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted hover:bg-hover-overlay transition-colors"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-button-primary text-white hover:bg-button-hover transition-colors"
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
