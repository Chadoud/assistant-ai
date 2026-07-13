/**
 * Standard page header for second-brain tab panels.
 *
 * Typography: title `text-base font-semibold`, subtitle one line max (`text-sm text-muted`).
 * Do not use uppercase tracking-wider section labels inside panel content — reserve that for Settings nav.
 */

import type { ReactNode } from "react";

interface PanelShellProps {
  title: string;
  subtitle?: string;
  /** Right-aligned actions (sync button, add, etc.). */
  actions?: ReactNode;
  /** Offline / connectivity banner below the header row. */
  offlineBanner?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export default function PanelShell({
  title,
  subtitle,
  actions,
  offlineBanner,
  children,
  className = "",
}: PanelShellProps) {
  return (
    <div className={`space-y-4 ${className}`.trim()}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          {subtitle ? (
            <p className="max-w-prose text-sm text-muted">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {offlineBanner}
      {children}
    </div>
  );
}
