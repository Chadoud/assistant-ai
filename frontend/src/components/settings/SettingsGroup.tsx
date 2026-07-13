import type { ReactNode } from "react";
import HoverHelpCard from "../ui/HoverHelpCard";
import { SETTINGS_GROUP_SUMMARY_CLASS } from "../../utils/styles";

interface SettingsGroupProps {
  /** Optional anchor id for scroll / command palette */
  id?: string;
  /** Group heading */
  title: string;
  /** Short visible line under the title (always shown when set). */
  summary?: string;
  /** Extended detail — shown in tooltip on the heading row when set. */
  description?: string;
  children: ReactNode;
  className?: string;
  /** Optional data-tour for product tour targeting */
  tour?: string;
  /** When false, only children render (tab title already shown in panel header). */
  showHeader?: boolean;
}

/**
 * Top-level Settings column group — title + optional summary + optional detail tooltip, then stacked children.
 */
export default function SettingsGroup({
  id,
  title,
  summary,
  description,
  children,
  className = "",
  tour,
  showHeader = true,
}: SettingsGroupProps) {
  const body = <div className="space-y-6">{children}</div>;

  const headerInner = (
    <header className="space-y-1 border-b border-border pb-3">
      <h2 className="text-base font-bold text-text-primary tracking-tight">{title}</h2>
      {summary ? <p className={SETTINGS_GROUP_SUMMARY_CLASS}>{summary}</p> : null}
    </header>
  );

  const heading =
    description ? (
      <HoverHelpCard hint={description} className="block">
        {headerInner}
      </HoverHelpCard>
    ) : (
      headerInner
    );

  return (
    <section id={id} className={`space-y-5 scroll-mt-28 ${className}`.trim()}>
      {showHeader ? (tour ? <div data-tour={tour}>{heading}</div> : heading) : null}
      {!showHeader && tour ? <div data-tour={tour} className="sr-only" aria-hidden /> : null}
      {body}
    </section>
  );
}
