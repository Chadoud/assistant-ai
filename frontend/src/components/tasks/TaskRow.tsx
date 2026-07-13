import type { Task } from "../../api/tasks";
import {
  formatTaskDue,
  formatTaskDueTime,
  isTaskOverdue,
} from "../../utils/taskDueFormat";
import { useI18n } from "../../i18n/I18nContext";

export type TaskSourceBadge = {
  label: string;
  tone: string;
};

type TaskRowProps = {
  task: Task;
  sourceBadge: TaskSourceBadge;
  dueDisplay: "grouped" | "full" | "none";
  onToggle: (task: Task) => void;
  onOpenSource?: (task: Task) => void;
  openBusy?: boolean;
};

/** Single task row — checkbox, title, source badge, optional due line. */
export default function TaskRow({
  task,
  sourceBadge,
  dueDisplay,
  onToggle,
  onOpenSource,
  openBusy = false,
}: TaskRowProps) {
  const { t } = useI18n();
  const overdue = isTaskOverdue(task.due_at, task.completed);

  const dueLabel =
    dueDisplay === "none" || !task.due_at
      ? null
      : dueDisplay === "grouped"
        ? formatTaskDueTime(task.due_at, task.source, t("tasks.allDay"))
        : `${overdue ? t("tasks.overdue") : t("tasks.due")}${formatTaskDue(task.due_at)}`;

  return (
    <li
      className={`rounded-xl border border-border bg-bg-secondary px-4 py-3 transition-colors ${
        task.completed ? "opacity-75" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onToggle(task)}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            task.completed ? "border-accent bg-button-primary text-white" : "border-border hover:border-accent"
          }`}
          aria-label={task.completed ? t("tasks.markIncomplete") : t("tasks.markComplete")}
        >
          {task.completed ? (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : null}
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm leading-snug ${
              task.completed ? "text-muted line-through" : "text-text-primary"
            }`}
          >
            {task.description}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${sourceBadge.tone}`}>
              {sourceBadge.label}
            </span>
            {dueLabel ? (
              <span
                className={`text-[11px] ${
                  dueDisplay === "full" && overdue
                    ? "font-medium text-red-400"
                    : dueDisplay === "grouped"
                      ? "text-muted tabular-nums"
                      : "text-muted"
                }`}
              >
                {dueLabel}
              </span>
            ) : null}
          </div>
        </div>
        {onOpenSource ? (
          <button
            type="button"
            onClick={() => onOpenSource(task)}
            disabled={openBusy}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-accent hover:bg-bg-primary disabled:opacity-50"
          >
            {openBusy ? t("memories.opening") : t("memories.open")}
          </button>
        ) : null}
      </div>
    </li>
  );
}
