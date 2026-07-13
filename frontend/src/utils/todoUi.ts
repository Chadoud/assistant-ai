import { TODO_SUB_TAB_STORAGE_KEY } from "../constants";

export type TodoSubTab = "today" | "inbox" | "done";

export function loadTodoSubTab(): TodoSubTab {
  try {
    const value = localStorage.getItem(TODO_SUB_TAB_STORAGE_KEY);
    if (value === "upcoming") {
      return "today";
    }
    if (value === "today" || value === "inbox" || value === "done") {
      return value;
    }
  } catch {
    /* ignore */
  }
  return "today";
}

export function persistTodoSubTab(tab: TodoSubTab): void {
  try {
    localStorage.setItem(TODO_SUB_TAB_STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
}

/** DOM ids for To Do “all sections” scroll — keep in sync with TasksPanel. */
export const TODO_SCROLL_SECTION_IDS = [
  "todo-section-today",
  "todo-section-inbox",
  "todo-section-done",
] as const;

export function todoSubTabForScrollSection(sectionId: string): TodoSubTab | null {
  switch (sectionId) {
    case "todo-section-today":
      return "today";
    case "todo-section-inbox":
      return "inbox";
    case "todo-section-done":
      return "done";
    default:
      return null;
  }
}
