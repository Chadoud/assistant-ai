import { useMemo, useState, type ReactNode } from "react";
import type { Task } from "../../api/tasks";
import type { CompletedDayGroup, DueDayGroup } from "../../utils/taskBuckets";
import {
  OVERDUE_DAY_COLLAPSE_THRESHOLD,
  OVERDUE_DAYS_EXPAND_BY,
  OVERDUE_DAYS_INITIAL,
  overdueDayGroups,
} from "../../utils/taskBuckets";
import { useI18n } from "../../i18n/I18nContext";
import TodoDayGroup from "./TodoDayGroup";
import { completedDayGroupTitle, dueDayGroupTitle } from "./todoDayGroupTitle";

const OVERDUE_EXPAND_STORAGE_KEY = "todo:overdue-expanded";

type TimelineMode = "today" | "upcoming" | "completed";

type TodoTaskTimelineProps = {
  mode: TimelineMode;
  dueGroups?: DueDayGroup[];
  completedGroups?: CompletedDayGroup[];
  renderTask: (task: Task, dueDisplay: "grouped" | "full" | "none") => ReactNode;
};

function readExpandedOverdueDays(): number {
  if (typeof sessionStorage === "undefined") return OVERDUE_DAYS_INITIAL;
  const raw = sessionStorage.getItem(OVERDUE_EXPAND_STORAGE_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : OVERDUE_DAYS_INITIAL;
  return Number.isFinite(parsed) && parsed >= OVERDUE_DAYS_INITIAL
    ? parsed
    : OVERDUE_DAYS_INITIAL;
}

/** Day-grouped task list with optional overdue collapse on Today. */
export default function TodoTaskTimeline({
  mode,
  dueGroups = [],
  completedGroups = [],
  renderTask,
}: TodoTaskTimelineProps) {
  const { t } = useI18n();
  const [visibleOverdueDays, setVisibleOverdueDays] = useState(readExpandedOverdueDays);

  const { visibleGroups, hiddenOverdueCount } = useMemo(() => {
    if (mode !== "today") {
      return { visibleGroups: dueGroups, hiddenOverdueCount: 0 };
    }

    const overdueGroups = overdueDayGroups(dueGroups);
    const todayGroup = dueGroups.find((group) => group.labelKind === "today");

    if (overdueGroups.length <= OVERDUE_DAY_COLLAPSE_THRESHOLD) {
      return { visibleGroups: dueGroups, hiddenOverdueCount: 0 };
    }

    const visibleOverdue = overdueGroups.slice(0, visibleOverdueDays);
    const hiddenOverdue = overdueGroups.slice(visibleOverdueDays);
    const visible = todayGroup ? [...visibleOverdue, todayGroup] : visibleOverdue;
    return { visibleGroups: visible, hiddenOverdueCount: hiddenOverdue.length };
  }, [dueGroups, mode, visibleOverdueDays]);

  const expandOlderOverdue = () => {
    setVisibleOverdueDays((current) => {
      const next = current + OVERDUE_DAYS_EXPAND_BY;
      sessionStorage.setItem(OVERDUE_EXPAND_STORAGE_KEY, String(next));
      return next;
    });
  };

  if (mode === "completed") {
    if (completedGroups.length === 0) return null;
    return (
      <div className="space-y-5">
        {completedGroups.map((group) => (
          <TodoDayGroup
            key={group.dayKey}
            sectionId={`todo-completed-${group.dayKey}`}
            labelKind="completed"
            title={completedDayGroupTitle(group, t)}
            taskCount={group.tasks.length}
          >
            {group.tasks.map((task) => renderTask(task, "grouped"))}
          </TodoDayGroup>
        ))}
      </div>
    );
  }

  if (visibleGroups.length === 0) return null;

  return (
    <div className="space-y-5">
      {visibleGroups.map((group) => (
        <TodoDayGroup
          key={group.dayKey}
          sectionId={`todo-day-${group.dayKey}`}
          labelKind={group.labelKind}
          title={dueDayGroupTitle(group, t)}
          taskCount={group.tasks.length}
          sticky={mode === "today" && group.labelKind === "today"}
        >
          {group.tasks.map((task) => renderTask(task, "grouped"))}
        </TodoDayGroup>
      ))}
      {hiddenOverdueCount > 0 ? (
        <button
          type="button"
          onClick={expandOlderOverdue}
          className="text-xs font-medium text-accent hover:underline"
        >
          {t("todo.dayGroup.showOlder", { n: hiddenOverdueCount })}
        </button>
      ) : null}
    </div>
  );
}

/** DOM id for the first overdue day group (scroll target). */
export function firstOverdueSectionId(groups: DueDayGroup[]): string | null {
  const first = overdueDayGroups(groups)[0];
  return first ? `todo-day-${first.dayKey}` : null;
}

/** DOM id for the today day group (scroll target). */
export function todaySectionId(groups: DueDayGroup[]): string | null {
  const today = groups.find((group) => group.labelKind === "today");
  return today ? `todo-day-${today.dayKey}` : null;
}
