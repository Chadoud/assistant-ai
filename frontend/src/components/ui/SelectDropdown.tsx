import {
  useRef,
  useState,
  useLayoutEffect,
  type RefObject,
  type ReactNode,
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { useClickOutside } from "../../hooks/useClickOutside";

/** Trigger button — matches Settings “Download New Model” control. */
const SELECT_DROPDOWN_TRIGGER_CLASS =
  "w-full flex items-center justify-between gap-2 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary hover:border-accent focus:outline-none focus:border-accent transition-colors disabled:opacity-50 disabled:pointer-events-none";

const SELECT_DROPDOWN_POSITION_CLASSES = new Set([
  "absolute",
  "left-0",
  "top-full",
  "z-20",
  "z-[20]",
  "mt-1",
]);

/** Strips in-flow drop positioning so the same panel can sit in a `fixed` portal layer. */
function panelClassNameForPortaledChild(className: string | undefined): string {
  if (!className) return "";
  return className
    .split(/\s+/)
    .filter((c) => c && !SELECT_DROPDOWN_POSITION_CLASSES.has(c))
    .join(" ");
}

const PORTAL_Z = 200;

function clampHorizontal(left: number, width: number) {
  const maxLeft = Math.max(8, window.innerWidth - width - 8);
  return Math.min(Math.max(8, left), maxLeft);
}

/** Floating panel under the trigger (in-flow) or a fixed portaled copy (see `portaled`). */
export const SELECT_DROPDOWN_PANEL_CLASS =
  "absolute left-0 top-full z-20 mt-1 w-full bg-bg-card border border-border rounded-lg shadow-xl overflow-hidden flex flex-col";

/** Row sizing for {@link selectDropdownPlainOptionClassName}. */
type SelectDropdownOptionDensity = "default" | "compact";

/**
 * CSS classes for a simple listbox option row (title bar locale, settings language, review filters, rules).
 *
 * @param isSelected Whether this row is the current value
 * @param density `compact` — smaller type and padding (language menus); `default` — everywhere else
 */
export function selectDropdownPlainOptionClassName(
  isSelected: boolean,
  density: SelectDropdownOptionDensity = "default",
): string {
  const sizing =
    density === "compact"
      ? "px-2.5 py-1.5 text-xs leading-snug"
      : "px-3 py-2 text-sm leading-normal";
  const row = `w-full text-left ${sizing} transition-colors border-b border-border-soft last:border-b-0`;
  return `${row} ${
    isSelected
      ? "bg-accent-light text-accent font-medium"
      : "text-text-primary hover:bg-hover-overlay"
  }`;
}

function SelectDropdownChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-muted transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

interface SelectDropdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerLabel: ReactNode;
  disabled?: boolean;
  /** Accessible name for the trigger (e.g. “Select model to download”). */
  ariaLabel: string;
  /** Optional id for the trigger (pair with `<label htmlFor>`). */
  triggerId?: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  /** Extra classes on the trigger (e.g. compact title bar sizing). Appended after base styles. */
  triggerClassName?: string;
  /**
   * When true, the list panel is rendered in `document.body` with `position: fixed` from the
   * trigger’s bounding rect so it is not clipped by `overflow: hidden` / scroll parents.
   */
  portaled?: boolean;
  children: ReactNode;
}

/**
 * Shared shell: trigger + chevron + click-outside to close.
 * Put `role="listbox"` (or menu) and options inside `children`.
 */
export default function SelectDropdown({
  open,
  onOpenChange,
  triggerLabel,
  disabled,
  ariaLabel,
  triggerId,
  triggerRef,
  triggerClassName,
  portaled = false,
  children,
}: SelectDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useClickOutside(
    containerRef,
    () => onOpenChange(false),
    open,
    portaled && open ? [panelRef] : undefined,
  );

  const close = () => onOpenChange(false);

  useLayoutEffect(() => {
    if (!open || !portaled) {
      setPanelPos(null);
      return;
    }
    const run = () => {
      const el = containerRef.current;
      if (!el) {
        setPanelPos(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const gap = 4; // ≈ mt-1
      /** Match trigger width — same as in-flow `w-full` on the panel; avoids inflating narrow controls (e.g. title bar). */
      const width = r.width;
      const left = clampHorizontal(r.left, width);
      setPanelPos({ top: r.bottom + gap, left, width });
    };
    run();
    const onScrollOrResize = () => run();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, portaled]);

  let portaledPanel: ReactNode = null;
  if (open && portaled && panelPos) {
    const onlyChild = Children.only(children);
    if (!isValidElement(onlyChild)) {
      portaledPanel = null;
    } else {
      const el = onlyChild as ReactElement<{ className?: string }>;
      const priorClass =
        typeof el.props.className === "string" ? el.props.className : "";
      portaledPanel = createPortal(
        <div
          ref={panelRef}
          className="fixed pointer-events-auto max-w-[calc(100vw-1rem)]"
          style={{
            top: panelPos.top,
            left: panelPos.left,
            width: panelPos.width,
            zIndex: PORTAL_Z,
          }}
        >
          {cloneElement(el, {
            className: [panelClassNameForPortaledChild(priorClass), "w-full"].filter(Boolean).join(" "),
          })}
        </div>,
        document.body,
      );
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        id={triggerId}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onOpenChange(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenChange(true);
          } else if (e.key === "Escape") {
            close();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={[SELECT_DROPDOWN_TRIGGER_CLASS, triggerClassName].filter(Boolean).join(" ")}
      >
        <span className="truncate text-left min-w-0 flex-1">{triggerLabel}</span>
        <SelectDropdownChevron open={open} />
      </button>
      {open && portaled ? portaledPanel : null}
      {open && !portaled ? children : null}
    </div>
  );
}
