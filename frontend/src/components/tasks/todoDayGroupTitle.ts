import type { CompletedDayGroup, DueDayGroup } from "../../utils/taskBuckets";
import {
  daysBeforeToday,
  formatDueDayShortDate,
  formatDueDayShortDayMonth,
} from "../../utils/taskDueFormat";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** User-facing header for a due-day group. */
export function dueDayGroupTitle(group: DueDayGroup, t: Translate): string {
  const date = formatDueDayShortDate(group.dayStart);

  if (group.labelKind === "today") {
    return t("todo.dayGroup.today", { date });
  }
  if (group.labelKind === "yesterday") {
    return t("todo.dayGroup.yesterday", { date });
  }
  if (group.labelKind === "upcoming") {
    return t("todo.dayGroup.upcoming", { date });
  }

  if (daysBeforeToday(group.dayStart) >= 8) {
    return t("todo.dayGroup.overdueShort", {
      date: formatDueDayShortDayMonth(group.dayStart),
    });
  }
  return t("todo.dayGroup.overdue", { date });
}

/** User-facing header for a completed-day group. */
export function completedDayGroupTitle(group: CompletedDayGroup, t: Translate): string {
  return t("todo.dayGroup.completed", {
    date: formatDueDayShortDate(group.dayStart),
  });
}
