import type { ReactNode } from "react";
import HoverHelpCard from "./HoverHelpCard";

interface InsightCardProps {
  id: string;
  title: string;
  subtitle: string;
  helpHint?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/**
 * Shared shell for job insight panels (donuts): title, one-line subtitle, optional hover help, body.
 */
export default function InsightCard({
  id,
  title,
  subtitle,
  helpHint,
  children,
  className = "",
  bodyClassName = "p-4 pt-3 min-w-0 flex-1 min-h-[12rem]",
}: InsightCardProps) {
  const heading = (
    <div className="min-w-0">
      <h3 id={id} className="text-sm font-semibold text-text-primary tracking-tight">
        {title}
      </h3>
      <p className="text-2xs text-muted mt-1 leading-snug line-clamp-2">{subtitle}</p>
    </div>
  );

  return (
    <section
      className={`flex flex-col min-h-0 rounded-2xl border border-border/70 bg-bg-card shadow-sm shadow-black/[0.04] dark:shadow-black/20 ${className}`.trim()}
      aria-labelledby={id}
    >
      <header className="px-4 pt-4 pb-3 border-b border-border-soft/90 bg-bg-card flex items-start gap-2 rounded-t-2xl">
        {helpHint ? (
          <HoverHelpCard hint={helpHint} className="min-w-0 flex-1 rounded-lg px-1 -mx-1">
            {heading}
          </HoverHelpCard>
        ) : (
          heading
        )}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
