import { useId, useEffect, useMemo, useRef, type ChangeEvent } from "react";
import type { SettingsNavEntry } from "../utils/settingsNav";
import {
  PANEL_SIDE_NAV_ACTIVE_CLASS,
  PANEL_SIDE_NAV_INACTIVE_CLASS,
} from "../utils/styles";

interface SettingsSideNavProps {
  items: SettingsNavEntry[];
  activeId: string;
  onSelect: (id: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  title: string;
  navAriaLabel: string;
  /** Filter query (matches nav labels and in-section setting text). */
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export default function SettingsSideNav({
  items,
  activeId,
  onSelect,
  t,
  title,
  navAriaLabel,
  searchQuery,
  onSearchChange,
}: SettingsSideNavProps) {
  const searchId = useId();
  const listRegionId = useId();
  const statusId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const searching = searchQuery.trim().length > 0;

  useEffect(() => {
    if (!activeId) return;
    const btn = listRef.current?.querySelector<HTMLElement>(`[data-settings-nav-id="${activeId}"]`);
    btn?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

  const liveMsg = useMemo(() => {
    if (!searching) return "";
    if (items.length === 0) return t("settings.sideNavSearchNoResults");
    return t("settings.sideNavSearchResultsCount", { count: items.length });
  }, [searching, items.length, t]);

  return (
    <nav
      className="w-[212px] shrink-0 border-r border-border bg-bg-secondary/50 flex flex-col min-h-0"
      aria-label={navAriaLabel}
    >
      <div className="p-3 border-b border-border-soft space-y-2">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <div className="space-y-1">
          <label htmlFor={searchId} className="sr-only">
            {t("settings.sideNavSearchAria")}
          </label>
          <input
            id={searchId}
            type="search"
            value={searchQuery}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
            placeholder={t("settings.sideNavSearchPlaceholder")}
            autoComplete="off"
            className="w-full rounded-lg border border-border bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary placeholder-muted focus:outline-none focus:border-accent"
            aria-controls={listRegionId}
          />
          <p id={statusId} className="sr-only" aria-live="polite">
            {liveMsg}
          </p>
        </div>
      </div>
      <div
        id={listRegionId}
        ref={listRef}
        className="flex-1 overflow-y-auto p-2 pb-3 space-y-0.5"
        role="list"
      >
        {searching && items.length === 0 ? (
          <p className="px-2.5 py-2 text-2xs text-muted leading-snug">{t("settings.sideNavSearchNoResults")}</p>
        ) : (
          items.map((item, idx) => {
            const active = activeId === item.id;
            const sectionTitle = item.depth === 0;
            const prev = items[idx - 1];
            const showGroupRule = sectionTitle && prev && prev.depth === 1;
            return (
              <div key={item.id} role="listitem">
                {showGroupRule ? (
                  <div className="my-2 border-t border-border-soft" aria-hidden />
                ) : null}
                <button
                  type="button"
                  data-settings-nav-id={item.id}
                  onClick={() => onSelect(item.id)}
                  className={`
                w-full text-left px-2.5 py-2 text-xs transition-colors rounded-md
                ${item.depth === 1 ? "pl-4" : ""}
                ${
                  active
                    ? PANEL_SIDE_NAV_ACTIVE_CLASS
                    : `${PANEL_SIDE_NAV_INACTIVE_CLASS} font-normal`
                }
                ${!active && sectionTitle ? "font-bold" : !active ? "font-normal" : ""}
              `}
                  aria-current={active ? "location" : undefined}
                >
                  {t(item.labelKey)}
                </button>
              </div>
            );
          })
        )}
      </div>
    </nav>
  );
}
