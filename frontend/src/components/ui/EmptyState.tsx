import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  children?: ReactNode;
  className?: string;
}

export default function EmptyState({
  title,
  description,
  primaryAction,
  secondaryAction,
  children,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`rounded-xl border border-dashed border-border bg-bg-secondary/40 px-6 py-10 text-center ${className}`.trim()}
    >
      <p className="text-sm font-medium text-text-primary">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted">{description}</p>
      ) : null}
      {children}
      {(primaryAction || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {primaryAction ? (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="rounded-lg bg-button-primary px-4 py-2 text-sm font-medium text-white hover:bg-button-hover"
            >
              {primaryAction.label}
            </button>
          ) : null}
          {secondaryAction ? (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary"
            >
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
