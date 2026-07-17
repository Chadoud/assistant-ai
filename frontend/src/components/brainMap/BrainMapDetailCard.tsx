/**
 * Selected-node inspector for the 3D brain map.
 */

import type { BrainNode } from "./graphModel";

export interface BrainMapDetailAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  helperText?: string;
}

interface Props {
  node: BrainNode;
  kindLabel: string;
  colorHex: string;
  busy: boolean;
  closeLabel: string;
  onClose: () => void;
  primaryAction: BrainMapDetailAction | null;
  openingLabel: string;
}

export default function BrainMapDetailCard({
  node,
  kindLabel,
  colorHex,
  busy,
  closeLabel,
  onClose,
  primaryAction,
  openingLabel,
}: Props) {
  return (
    <div className="w-64 rounded-xl border border-border bg-bg-primary/95 p-3 shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white"
          style={{ background: colorHex }}
        >
          {kindLabel}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-muted hover:text-text-primary"
          aria-label={closeLabel}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-text-primary">
        {node.detail}
      </p>
      {primaryAction?.helperText ? (
        <p className="mt-2 text-[10px] leading-relaxed text-muted">{primaryAction.helperText}</p>
      ) : null}
      {primaryAction ? (
        <button
          type="button"
          disabled={busy || primaryAction.disabled}
          onClick={() => void primaryAction.onClick()}
          className="mt-2.5 w-full rounded-lg bg-button-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? openingLabel : primaryAction.label}
        </button>
      ) : null}
    </div>
  );
}
