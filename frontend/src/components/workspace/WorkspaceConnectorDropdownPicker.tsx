import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const MENU_GAP_PX = 4;
const MENU_MAX_HEIGHT_PX = 256;

export const WORKSPACE_CONNECTOR_PICKER_CONTROL_HEIGHT_CLASS = "h-10 box-border";

/** Uppercase group label inside a connector dropdown menu (matches Gmail folder picker). */
export function WorkspaceConnectorPickerGroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 pt-0.5 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted/70">
      {children}
    </p>
  );
}

/** Checkbox row inside a connector dropdown menu. */
export function WorkspaceConnectorPickerCheckboxRow({
  checked,
  disabled = false,
  indent = false,
  onChange,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  indent?: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm ${
        indent ? "pl-6 " : ""
      }${
        disabled
          ? "text-muted cursor-not-allowed"
          : "hover:bg-hover-overlay/50 cursor-pointer text-text-primary"
      }`}
    >
      <input
        type="checkbox"
        className="accent-accent shrink-0"
        disabled={disabled}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

interface WorkspaceConnectorDropdownPickerProps {
  summary: string;
  disabled?: boolean;
  id?: string;
  children: ReactNode;
}

/**
 * Gmail-style workspace filter dropdown: button trigger + portaled checkbox menu.
 */
export default function WorkspaceConnectorDropdownPicker({
  summary,
  disabled = false,
  id,
  children,
}: WorkspaceConnectorDropdownPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuBox, setMenuBox] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const updateMenuPosition = useCallback(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportPad = 8;
    let left = rect.left;
    const width = rect.width;
    if (left + width > window.innerWidth - viewportPad) {
      left = Math.max(viewportPad, window.innerWidth - width - viewportPad);
    }
    const top = rect.bottom + MENU_GAP_PX;
    const spaceBelow = window.innerHeight - top - viewportPad;
    setMenuBox({
      top,
      left,
      width,
      maxHeight: Math.min(MENU_MAX_HEIGHT_PX, Math.max(96, spaceBelow)),
    });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuBox(null);
      return;
    }
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const node = e.target as Node;
      if (triggerWrapRef.current?.contains(node)) return;
      if (menuRef.current?.contains(node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={triggerWrapRef} className="relative w-full">
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-bg-card px-3 text-sm text-text-primary text-left hover:bg-hover-overlay/40 disabled:opacity-50 ${WORKSPACE_CONNECTOR_PICKER_CONTROL_HEIGHT_CLASS}`}
      >
        <span className="truncate">{summary}</span>
        <svg
          className={`w-4 h-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open &&
        !disabled &&
        menuBox &&
        createPortal(
          <div
            ref={menuRef}
            className="z-[80] overflow-y-auto rounded-lg border border-border bg-bg-card py-2 px-2 shadow-lg space-y-1"
            style={{
              position: "fixed",
              top: menuBox.top,
              left: menuBox.left,
              width: menuBox.width,
              maxHeight: menuBox.maxHeight,
            }}
            role="listbox"
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  );
}
