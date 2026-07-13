import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../../i18n/I18nContext";
import { SECONDARY_BTN_CLASS } from "../../../utils/styles";

const PANEL_MAX_WIDTH_PX = 520;
const PANEL_MAX_HEIGHT_CSS = "min(32rem,70vh)";
const PANEL_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 12;
const PANEL_Z_INDEX = 200;

interface SortInstructionsAnchorPopoverProps {
  triggerLabel: ReactNode;
  panelTitle: string;
  children: ReactNode;
  /** When set, only one popover in a group may be open. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  disabledTitle?: string;
  badge?: number;
  /** Extra classes on the trigger button. */
  triggerClassName?: string;
}

/**
 * Portaled popover anchored to a secondary button — used by the sort instructions strip.
 */
export function SortInstructionsAnchorPopover({
  triggerLabel,
  panelTitle,
  children,
  open: controlledOpen,
  onOpenChange,
  disabled = false,
  disabledTitle,
  badge,
  triggerClassName = "",
}: SortInstructionsAnchorPopoverProps) {
  const { t } = useI18n();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return;
    }
    const run = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        setPanelStyle(null);
        return;
      }
      const rect = trigger.getBoundingClientRect();
      const panelWidth = Math.min(PANEL_MAX_WIDTH_PX, window.innerWidth - VIEWPORT_MARGIN_PX * 2);
      let left = rect.left;
      left = Math.min(Math.max(VIEWPORT_MARGIN_PX, left), window.innerWidth - panelWidth - VIEWPORT_MARGIN_PX);
      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN_PX;
      const spaceAbove = rect.top - VIEWPORT_MARGIN_PX;
      const openBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove;
      const top = openBelow ? rect.bottom + PANEL_GAP_PX : Math.max(VIEWPORT_MARGIN_PX, rect.top - PANEL_GAP_PX);
      setPanelStyle({
        position: "fixed",
        top: openBelow ? top : undefined,
        bottom: openBelow ? undefined : window.innerHeight - rect.top + PANEL_GAP_PX,
        left,
        width: panelWidth,
        maxHeight: PANEL_MAX_HEIGHT_CSS,
        zIndex: PANEL_Z_INDEX,
      });
    };
    run();
    window.addEventListener("scroll", run, true);
    window.addEventListener("resize", run);
    return () => {
      window.removeEventListener("scroll", run, true);
      window.removeEventListener("resize", run);
    };
  }, [open]);

  const panelContent = open ? (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-labelledby={`${panelId}-title`}
      style={panelStyle ?? undefined}
      className={`overflow-y-auto rounded-xl border border-border bg-bg-card p-4 shadow-xl${
        panelStyle ? "" : " invisible pointer-events-none fixed left-0 top-0 w-[26rem]"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 id={`${panelId}-title`} className="text-base font-semibold text-text-primary">
          {panelTitle}
        </h2>
        <button
          type="button"
          className="rounded p-1 text-muted hover:bg-hover-overlay hover:text-text-primary"
          aria-label={t("queue.sortPromptClose")}
          onClick={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="inline-flex">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        className={`${SECONDARY_BTN_CLASS} inline-flex items-center gap-1.5 text-xs py-1.5 px-2.5 disabled:opacity-50 disabled:cursor-not-allowed ${triggerClassName}`.trim()}
        onClick={() => {
          if (disabled) return;
          setOpen(!open);
        }}
      >
        <span>{triggerLabel}</span>
        {badge != null && badge > 0 ? (
          <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-semibold tabular-nums text-accent">
            {badge}
          </span>
        ) : null}
        <svg
          className={`h-3.5 w-3.5 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && panelStyle ? createPortal(panelContent, document.body) : null}
    </div>
  );
}
