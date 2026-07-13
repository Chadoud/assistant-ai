import { describe, expect, it } from "vitest";
import type { Task } from "../api/tasks";
import {
  groupTasksByCompletedDay,
  groupTasksByDueDay,
  groupTasksByUpcomingDay,
  splitTodayTasks,
} from "./taskBuckets";
import { startOfLocalDay } from "./taskDueFormat";

function task(partial: Partial<Task> & Pick<Task, "id" | "description">): Task {
  return {
    completed: false,
    due_at: null,
    priority: "normal",
    completed_at: null,
    source: "assistant",
    source_conversation_id: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

function localIso(year: number, month: number, day: number, hour = 9): string {
  const d = new Date(year, month - 1, day, hour, 0, 0, 0);
  return d.toISOString();
}

describe("splitTodayTasks", () => {
  it("puts past-due items in overdue", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const { overdue, dueToday } = splitTodayTasks([
      task({ id: 1, description: "Late", due_at: yesterday.toISOString() }),
    ]);
    expect(overdue).toHaveLength(1);
    expect(dueToday).toHaveLength(0);
  });

  it("keeps same-calendar-day tasks in dueToday even if time passed", () => {
    const earlierToday = startOfLocalDay();
    earlierToday.setHours(8, 0, 0, 0);
    const { overdue, dueToday } = splitTodayTasks([
      task({ id: 1, description: "Morning", due_at: earlierToday.toISOString() }),
    ]);
    expect(overdue).toHaveLength(0);
    expect(dueToday).toHaveLength(1);
  });

  it("skips completed and far-future tasks", () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const { overdue, dueToday } = splitTodayTasks([
      task({ id: 1, description: "Done", completed: true, due_at: new Date().toISOString() }),
      task({ id: 2, description: "Later", due_at: nextWeek.toISOString() }),
    ]);
    expect(overdue).toHaveLength(0);
    expect(dueToday).toHaveLength(0);
  });
});

describe("groupTasksByDueDay", () => {
  it("creates separate groups per overdue day sorted oldest first", () => {
    const today = startOfLocalDay();
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const fiveDaysAgo = new Date(today);
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const groups = groupTasksByDueDay([
      task({ id: 1, description: "A", due_at: twoDaysAgo.toISOString() }),
      task({ id: 2, description: "B", due_at: fiveDaysAgo.toISOString() }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.tasks.map((item) => item.id)).toEqual([2]);
    expect(groups[1]?.tasks.map((item) => item.id)).toEqual([1]);
    expect(groups[0]?.labelKind).toBe("overdue");
  });

  it("marks today's due tasks with today labelKind", () => {
    const today = startOfLocalDay();
    today.setHours(15, 0, 0, 0);
    const groups = groupTasksByDueDay([
      task({ id: 1, description: "Later today", due_at: today.toISOString() }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.labelKind).toBe("today");
  });

  it("excludes completed and upcoming tasks", () => {
    const tomorrow = startOfLocalDay();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const groups = groupTasksByDueDay([
      task({ id: 1, description: "Done", completed: true, due_at: new Date().toISOString() }),
      task({ id: 2, description: "Future", due_at: tomorrow.toISOString() }),
    ]);
    expect(groups).toHaveLength(0);
  });
});

describe("groupTasksByUpcomingDay", () => {
  it("groups only tasks due from tomorrow onward", () => {
    const tomorrow = startOfLocalDay();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const groups = groupTasksByUpcomingDay([
      task({ id: 1, description: "Tomorrow", due_at: tomorrow.toISOString() }),
      task({ id: 2, description: "Later", due_at: dayAfter.toISOString() }),
      task({ id: 3, description: "Today", due_at: new Date().toISOString() }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.labelKind === "upcoming")).toBe(true);
  });
});

describe("groupTasksByCompletedDay", () => {
  it("groups by completed_at day newest first", () => {
    const groups = groupTasksByCompletedDay([
      task({
        id: 1,
        description: "Old",
        completed: true,
        completed_at: localIso(2026, 6, 10),
        due_at: localIso(2026, 6, 9),
      }),
      task({
        id: 2,
        description: "New",
        completed: true,
        completed_at: localIso(2026, 6, 15),
        due_at: localIso(2026, 6, 14),
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.tasks[0]?.id).toBe(2);
    expect(groups[1]?.tasks[0]?.id).toBe(1);
  });
});
