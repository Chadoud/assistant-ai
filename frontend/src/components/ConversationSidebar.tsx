import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Conversation } from "../hooks/useConversations";
import { ASSISTANT_WORKSPACE_TOP_BAR_CLASS } from "../constants";
import { useI18n } from "../i18n/I18nContext";
import "../styles/exo.css";

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  /** Controlled collapsed state — parent owns this so it can sync with the resize handle. */
  collapsed?: boolean;
  onCollapseToggle?: () => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

interface RenameInputProps {
  id: string;
  initialValue: string;
  onCommit: (id: string, title: string) => void;
  onCancel: () => void;
}

function RenameInput({ id, initialValue, onCommit, onCancel }: RenameInputProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const commit = () => {
    onCommit(id, value.trim() || initialValue);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") onCancel();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKey}
      className="w-full rounded border border-accent bg-bg-primary px-1.5 py-0.5 text-xs text-text-primary outline-none focus:ring-1 focus:ring-accent"
      aria-label="Rename conversation"
    />
  );
}

export default function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  collapsed = false,
  onCollapseToggle,
}: ConversationSidebarProps) {
  const { t } = useI18n();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDeleteClick = (id: string) => {
    if (deleteConfirmId === id) {
      onDelete(id);
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(id);
      // Auto-cancel confirm after 3 s
      setTimeout(() => setDeleteConfirmId((cur) => (cur === id ? null : cur)), 3000);
    }
  };

  return (
    <div
      className="flex w-full flex-col bg-bg-secondary overflow-hidden h-full"
      aria-label={t("assistant.conversationSidebarToggle")}
    >
      {/* New chat + collapse toggle row */}
      <div className={`${ASSISTANT_WORKSPACE_TOP_BAR_CLASS} px-2`}>
        {!collapsed && (
          <button
            type="button"
            onClick={onNew}
            title={t("assistant.conversationNew")}
            className="flex flex-1 min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-text-primary hover:bg-hover-overlay transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="truncate">{t("assistant.conversationNew")}</span>
          </button>
        )}
        {collapsed && (
          <button
            type="button"
            onClick={onNew}
            title={t("assistant.conversationNew")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-primary hover:bg-hover-overlay transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        )}

        {onCollapseToggle && (
          <button
            type="button"
            onClick={onCollapseToggle}
            title={t("assistant.conversationSidebarToggle")}
            aria-label={t("assistant.conversationSidebarToggle")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-hover-overlay hover:text-text-primary transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={collapsed ? "M8.25 4.5l7.5 7.5-7.5 7.5" : "M15.75 19.5l-7.5-7.5 7.5-7.5"}
              />
            </svg>
          </button>
        )}
      </div>

      {/* Conversation list */}
      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto py-1">
        {conversations.map((conv) => {
          const isActive = conv.id === activeId;
          const isRenaming = renamingId === conv.id;
          const isConfirmingDelete = deleteConfirmId === conv.id;

          return (
            <div
              key={conv.id}
              className={`group relative flex items-center gap-1.5 px-2 py-1.5 cursor-pointer transition-colors ${
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-text-primary hover:bg-hover-overlay"
              }`}
              onClick={() => !isRenaming && onSelect(conv.id)}
              role="button"
              aria-current={isActive ? "true" : undefined}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isRenaming) onSelect(conv.id);
              }}
            >
              {collapsed ? (
                /* Collapsed: avatar circle */
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase ${
                    isActive ? "bg-button-primary text-white" : "bg-border text-muted"
                  }`}
                  title={conv.title}
                >
                  {conv.title.charAt(0)}
                </div>
              ) : isRenaming ? (
                <RenameInput
                  id={conv.id}
                  initialValue={conv.title}
                  onCommit={(id, title) => {
                    onRename(id, title);
                    setRenamingId(null);
                  }}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium leading-tight">{conv.title}</p>
                    <p className="text-[10px] text-muted leading-tight">
                      {relativeTime(conv.updatedAt)}
                    </p>
                  </div>

                  {/* Hover actions */}
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Rename */}
                    <button
                      type="button"
                      title={t("assistant.conversationRenameLabel")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(conv.id);
                      }}
                      className="rounded p-0.5 text-muted hover:text-text-primary hover:bg-hover-overlay transition-colors"
                      aria-label={t("assistant.conversationRenameLabel")}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="h-3 w-3"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
                        />
                      </svg>
                    </button>

                    {/* Delete (2-step confirm) */}
                    <button
                      type="button"
                      title={
                        isConfirmingDelete
                          ? t("assistant.conversationDeleteConfirm")
                          : t("assistant.conversationRenameLabel")
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(conv.id);
                      }}
                      className={`rounded p-0.5 transition-colors ${
                        isConfirmingDelete
                          ? "text-red-500 hover:text-red-600"
                          : "text-muted hover:text-text-primary hover:bg-hover-overlay"
                      }`}
                      aria-label={t("assistant.conversationDeleteConfirm")}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="h-3 w-3"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
