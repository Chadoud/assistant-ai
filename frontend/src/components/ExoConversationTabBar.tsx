import { useEffect, useRef } from "react";
import type { Conversation } from "../hooks/useConversations";
import { useI18n } from "../i18n/I18nContext";
import { SidebarRailToggleGlyph } from "./SidebarRailToggleGlyph";

import "../styles/exo.css";

interface ExoConversationTabBarProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: (id: string) => void;
  /** Cursor-style history drawer (search + grouped list). */
  historyOpen?: boolean;
  onToggleHistory?: () => void;
  /** Collapses the AI Manager chat rail to a thin strip (center view expands). */
  onCollapseChatRail?: () => void;
  /** Opens the full-width Chat AI tab (the rail's expanded counterpart). */
  onExpandToChat?: () => void;
}

/**
 * Horizontal chat tabs and “new chat” control for the AI Manager rail (Cursor-like).
 */
export default function ExoConversationTabBar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onClose,
  historyOpen = false,
  onToggleHistory,
  onCollapseChatRail,
  onExpandToChat,
}: ExoConversationTabBarProps) {
  const { t } = useI18n();
  const activeBtnRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeBtnRef.current?.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
  }, [activeId]);

  // Redirect vertical wheel scroll to horizontal so the tab strip scrolls naturally
  // on a standard mouse wheel without needing Shift. Uses a non-passive listener so
  // preventDefault() can suppress the page scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="flex h-11 min-h-[2.75rem] shrink-0 items-stretch border-b border-border bg-bg-secondary/95">
      {onCollapseChatRail && (
        <button
          type="button"
          onClick={onCollapseChatRail}
          title={t("assistant.chatRailCollapse")}
          aria-label={t("assistant.chatRailCollapseAria")}
          className="flex h-full w-9 shrink-0 items-center justify-center border-r border-border text-muted transition-colors hover:bg-hover-overlay hover:text-text-primary"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
          </svg>
        </button>
      )}
      <div
        ref={scrollRef}
        className="tab-bar-scroll flex min-h-0 min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden"
        role="tablist"
        aria-label={t("assistant.exoChatTabListAria")}
      >
        {conversations.map((conv) => {
          const isActive = conv.id === activeId;
          return (
            <div
              key={conv.id}
              role="none"
              className={`flex min-w-[5.5rem] max-w-[11rem] shrink-0 border-r border-border transition-colors ${
                isActive ? "bg-bg-primary" : "bg-transparent hover:bg-hover-overlay/80"
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                ref={isActive ? activeBtnRef : undefined}
                onClick={() => onSelect(conv.id)}
                title={conv.title}
                className={`min-w-0 flex-1 truncate px-2 py-2 text-left text-xs font-medium transition-colors ${
                  isActive ? "text-text-primary" : "text-muted hover:text-text-primary"
                }`}
              >
                {conv.title}
              </button>
              <button
                type="button"
                tabIndex={-1}
                title={t("assistant.closeConversationTabAria")}
                aria-label={t("assistant.closeConversationTabAria")}
                onClick={() => onClose(conv.id)}
                className="flex w-8 shrink-0 items-center justify-center text-muted opacity-70 transition-colors hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {onExpandToChat ? (
        <button
          type="button"
          onClick={() => onExpandToChat()}
          title={t("assistant.chatExpandToTab")}
          aria-label={t("assistant.chatExpandToTabAria")}
          className="flex h-full w-10 shrink-0 items-center justify-center border-l border-border text-muted transition-colors hover:bg-hover-overlay hover:text-text-primary"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 8.25V4.5h3.75M20.25 8.25V4.5H16.5M3.75 15.75v3.75h3.75M20.25 15.75v3.75H16.5" />
          </svg>
        </button>
      ) : null}

      {onToggleHistory ? (
        <button
          type="button"
          onClick={() => onToggleHistory()}
          title={t("assistant.chatHistoryToggle")}
          aria-label={t("assistant.chatHistoryToggleAria")}
          aria-pressed={historyOpen}
          className={`flex h-full w-10 shrink-0 items-center justify-center border-l border-border transition-colors hover:bg-hover-overlay hover:text-text-primary ${
            historyOpen ? "bg-accent/12 text-accent" : "text-muted"
          }`}
        >
          <SidebarRailToggleGlyph railOpen={historyOpen} />
        </button>
      ) : null}

      <button
        type="button"
        onClick={onNew}
        title={t("assistant.conversationNew")}
        aria-label={t("assistant.conversationNew")}
        className="flex h-full w-10 shrink-0 items-center justify-center border-l border-border text-muted transition-colors hover:bg-hover-overlay hover:text-text-primary"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
    </div>
  );
}
