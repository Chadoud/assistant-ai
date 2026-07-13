import { useCallback, useState } from "react";
import { loadTodoSubTab, persistTodoSubTab, type TodoSubTab } from "../utils/todoUi";

/** To Do sub-view — synced with sidebar. */
export function useTodoSubTab() {
  const [todoSubTab, setTodoSubTab] = useState<TodoSubTab>(loadTodoSubTab);
  const [todoShowAllSections, setTodoShowAllSections] = useState(false);

  const selectTodoSubTab = useCallback((tab: TodoSubTab) => {
    setTodoShowAllSections(false);
    setTodoSubTab(tab);
    persistTodoSubTab(tab);
  }, []);

  const selectTodoAllSections = useCallback(() => {
    setTodoShowAllSections(true);
  }, []);

  return {
    todoSubTab,
    todoShowAllSections,
    selectTodoSubTab,
    selectTodoAllSections,
  };
};
