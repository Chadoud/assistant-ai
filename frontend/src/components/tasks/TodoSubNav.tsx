import type { TodoSubTab } from "../../utils/todoUi";
import { useI18n } from "../../i18n/I18nContext";

const SUB_TABS: TodoSubTab[] = ["today", "inbox", "done"];

const LABEL_KEYS: Record<TodoSubTab, string> = {
  today: "nav.todoToday",
  inbox: "nav.todoInbox",
  done: "nav.todoDone",
};

type TodoSubNavProps = {
  active: TodoSubTab;
  onSelect: (tab: TodoSubTab) => void;
  badges?: Partial<Record<TodoSubTab, number>>;
};

/** In-panel To Do tabs — mirrors the sidebar so context stays obvious in the main column. */
export default function TodoSubNav({ active, onSelect, badges }: TodoSubNavProps) {
  const { t } = useI18n();

  return (
    <nav
      className="mb-4 flex w-full gap-1.5 border-b border-border pb-3"
      aria-label={t("nav.todo")}
    >
      {SUB_TABS.map((tab) => {
        const count = badges?.[tab] ?? 0;
        const isActive = tab === active;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onSelect(tab)}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
              ${
                isActive
                  ? "bg-button-primary text-white"
                  : "text-muted hover:bg-hover-overlay hover:text-text-primary"
              }`}
          >
            <span>{t(LABEL_KEYS[tab])}</span>
            {count > 0 ? (
              <span
                className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums leading-none
                  ${isActive ? "bg-white/25 text-white" : "bg-accent/15 text-accent"}`}
              >
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
