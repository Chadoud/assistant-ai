import type { ReactNode } from "react";

type ExternalSourceStatusTone = "ready" | "warning" | "neutral";

interface ExternalSourceCardProps {
  id?: string;
  title: string;
  /** Inline control immediately after the title (e.g. token guide “?”). */
  titleTrailing?: ReactNode;
  /** Connect / disconnect controls — same row as the title, aligned to the right. */
  actions?: ReactNode;
  brandIcon: ReactNode;
  statusLabel: string;
  statusTone: ExternalSourceStatusTone;
  /** Welcome setup: tighter card shell. */
  compact?: boolean;
  children?: ReactNode;
}

/** Primary connect / setup action — pass to `actions` in connector cards. */
export const EXTERNAL_SOURCE_CARD_PRIMARY_ACTION_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-accent-line bg-accent-light px-2.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15 disabled:pointer-events-none disabled:opacity-40";

/** Secondary disconnect / cancel action — pass to `actions` in connector cards. */
export const EXTERNAL_SOURCE_CARD_SECONDARY_ACTION_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-border px-2.5 text-xs font-medium text-muted transition-colors hover:bg-hover-overlay disabled:pointer-events-none disabled:opacity-40";

/** Grid cell padding — room for the status tag on the top border (see tag transforms). */
export const EXTERNAL_SOURCE_CARD_TAG_GUTTER_CLASS = "pt-3 pe-9 sm:pe-10";

const ICON_COLUMN_CLASS = "w-10 shrink-0";

function statusToneClass(tone: ExternalSourceStatusTone): string {
  if (tone === "ready") return "bg-success-soft text-success border-success-line/40";
  if (tone === "warning") return "bg-warning-soft text-warning border-warning-line/40";
  return "bg-bg-card text-muted border-border";
}

/**
 * Shared card shell for External sources connectors.
 * Status tag straddles the top border near the right corner, slightly outside the card.
 */
export default function ExternalSourceCard({
  id,
  title,
  titleTrailing,
  actions,
  brandIcon,
  statusLabel,
  statusTone,
  compact = false,
  children,
}: ExternalSourceCardProps) {
  const shellPadding = compact ? "px-3.5 py-3" : "px-5 py-4";
  const shellHeight = compact ? "min-h-[4.25rem]" : "min-h-[4.5rem]";

  return (
    <section
      id={id}
      className={`relative flex w-full flex-col justify-center overflow-visible rounded-xl border border-border bg-bg-card shadow-sm shadow-black/[0.03] dark:shadow-black/15 scroll-mt-28 ${shellHeight} ${shellPadding}`}
      aria-label={title}
    >
      <span
        className={`pointer-events-none absolute top-0 right-0 z-10 max-w-[9rem] -translate-y-1/2 translate-x-[42%] truncate rounded-full border text-2xs font-medium leading-none shadow-sm ring-2 ring-bg-card ${statusToneClass(statusTone)} ${
          compact ? "px-2 py-1" : "px-2.5 py-1"
        }`}
        title={statusLabel}
      >
        {statusLabel}
      </span>

      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex ${ICON_COLUMN_CLASS} items-center justify-center shrink-0`}>{brandIcon}</div>

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <h2
            className="min-w-0 shrink truncate text-sm font-semibold leading-snug text-text-primary sm:text-base"
            title={title}
          >
            {title}
          </h2>
          {titleTrailing ? <div className="shrink-0">{titleTrailing}</div> : null}
          {actions ? (
            <div className="ml-auto flex shrink-0 items-center gap-2 pl-1">{actions}</div>
          ) : null}
        </div>
      </div>

      {children ? <div className={compact ? "mt-3 space-y-2" : "mt-4 space-y-3"}>{children}</div> : null}
    </section>
  );
}
