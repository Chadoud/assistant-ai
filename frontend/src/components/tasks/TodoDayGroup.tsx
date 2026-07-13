import type { ReactNode } from "react";
import type { DueDayLabelKind } from "../../utils/taskBuckets";
import { useI18n } from "../../i18n/I18nContext";

type TodoDayGroupProps = {
  sectionId: string;
  labelKind: DueDayLabelKind | "completed";
  title: string;
  taskCount: number;
  sticky?: boolean;
  children: ReactNode;
};

/** One calendar-day section in the task timeline. */
export default function TodoDayGroup({
  sectionId,
  labelKind,
  title,
  taskCount,
  sticky = false,
  children,
}: TodoDayGroupProps) {
  const { t } = useI18n();
  const isOverdue = labelKind === "overdue" || labelKind === "yesterday";
  const isToday = labelKind === "today";

  const accentClass = isOverdue
    ? "border-red-400/60"
    : isToday
      ? "border-accent/60"
      : "border-border-mid";

  const titleClass = isOverdue
    ? "text-red-400"
    : isToday
      ? "text-text-primary"
      : "text-muted";

  return (
    <section
      id={sectionId}
      aria-labelledby={`${sectionId}-heading`}
      className="scroll-mt-24 space-y-2"
    >
      <div
        className={`flex items-center justify-between gap-2 border-l-2 pl-3 ${accentClass} ${
          sticky ? "sticky top-0 z-10 -mx-1 bg-bg-primary/95 px-1 py-1 backdrop-blur-sm" : ""
        }`}
      >
        <h3 id={`${sectionId}-heading`} className={`text-sm font-semibold ${titleClass}`}>
          {title}
        </h3>
        <span
          className="shrink-0 rounded-full bg-surface-subtle px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted"
          aria-label={t("todo.dayGroup.taskCountAria", { n: taskCount })}
        >
          {taskCount}
        </span>
      </div>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}
