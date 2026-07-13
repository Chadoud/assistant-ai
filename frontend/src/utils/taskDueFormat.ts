/** Shared due-date formatting for tasks (Today tab + Home). */

const DAY_MS = 86_400_000;

/** Local calendar midnight for the given instant (default: now). */
export function startOfLocalDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Stable local `YYYY-MM-DD` key for grouping tasks by due day. */
export function localDayKey(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const day = startOfLocalDay(parsed);
  const year = day.getFullYear();
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const dayNum = String(day.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNum}`;
}

/** Whole-day calendar events often arrive at local midnight. */
function isCalendarTaskSource(source: string): boolean {
  return source === "google-calendar" || source === "outlook-calendar";
}

function isAllDayDueAt(due: string, source: string): boolean {
  if (!isCalendarTaskSource(source)) return false;
  const parsed = new Date(due);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getHours() === 0 && parsed.getMinutes() === 0;
}

export function formatTaskDue(due: string | null): string {
  if (!due) return "";
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Time-only label for rows under a day group header. */
export function formatTaskDueTime(
  due: string | null,
  source: string,
  allDayLabel: string,
): string {
  if (!due) return "";
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return "";
  if (isAllDayDueAt(due, source)) return allDayLabel;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function formatDueDayShortDate(dayStart: Date): string {
  return dayStart.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatDueDayShortDayMonth(dayStart: Date): string {
  return dayStart.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Calendar days between `dayStart` (midnight) and today (midnight). */
export function daysBeforeToday(dayStart: Date, todayStart: Date = startOfLocalDay()): number {
  return Math.round((todayStart.getTime() - dayStart.getTime()) / DAY_MS);
}

export function isTaskOverdue(dueAt: string | null, completed: boolean): boolean {
  if (completed || !dueAt) return false;
  const due = new Date(dueAt);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}
