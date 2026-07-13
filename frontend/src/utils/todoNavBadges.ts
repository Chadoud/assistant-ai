import type { MainNavItem } from "../hooks/useMainNavItems";
import type { TodoFeedCounts } from "../hooks/useTodoFeed";

function formatBadge(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count > 99 ? "99+" : String(count);
}

/** Attach inbox/today badges to To Do sidebar children from live feed counts. */
export function applyTodoNavBadges(items: MainNavItem[], counts: TodoFeedCounts): MainNavItem[] {
  if (!counts.loaded) return items;

  return items.map((item) => {
    if (item.id !== "tasks" || !item.children?.length) return item;
    return {
      ...item,
      children: item.children.map((child) => {
        if (child.todoSubTab === "inbox") {
          return { ...child, badge: formatBadge(counts.inbox) };
        }
        if (child.todoSubTab === "today") {
          return { ...child, badge: formatBadge(counts.today) };
        }
        return child;
      }),
    };
  });
}
