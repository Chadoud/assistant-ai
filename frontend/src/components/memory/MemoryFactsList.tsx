import type { MouseEvent } from "react";
import type { ScopedMemoryEntry } from "../../api/memory";
import { useI18n } from "../../i18n/I18nContext";
import {
  groupMemoryEntriesByProvenance,
  formatMemorySourceLine,
  memoryProvenanceGroupLabelKey,
  splitHighlightSegments,
  systemMemoryLabelKey,
  type MemoryProvenanceGroup,
} from "../../utils/memoryUi";
import { memoryMayHaveOpenTarget } from "../../utils/memoryOrigin";
import RowActionsMenu from "../ui/RowActionsMenu";

interface Props {
  entries: ScopedMemoryEntry[];
  query: string;
  editingId: number | null;
  editValue: string;
  reviewMode?: boolean;
  groupByProvenance?: boolean;
  selectionEnabled?: boolean;
  selectedIds?: ReadonlySet<number>;
  focusedId?: number | null;
  allVisibleSelected?: boolean;
  someVisibleSelected?: boolean;
  isSelectable?: (id: number) => boolean;
  onToggleSelect?: (id: number, opts?: { shift?: boolean; meta?: boolean }) => void;
  onSelectAllVisible?: () => void;
  onClearSelection?: () => void;
  onSelectGroup?: (ids: number[]) => void;
  onRowFocus?: (id: number) => void;
  onStartEdit: (entry: ScopedMemoryEntry) => void;
  onEditChange: (value: string) => void;
  onSaveEdit: (id: number) => void;
  onCancelEdit: () => void;
  onDelete: (id: number) => void;
  onApprove?: (id: number) => void;
  onOpen?: (entry: ScopedMemoryEntry) => void;
  openBusyId?: number | null;
}

function HighlightedValue({ text, query }: { text: string; query: string }) {
  const segments = splitHighlightSegments(text, query);
  return (
    <p className="text-sm leading-snug text-text-primary">
      {segments.map((seg, i) =>
        seg.highlight ? (
          <mark key={i} className="rounded bg-accent/25 text-text-primary">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </p>
  );
}

function MemoryFactRow({
  entry,
  query,
  editingId,
  editValue,
  reviewMode,
  selectionEnabled,
  selected,
  focused,
  selectable,
  onToggleSelect,
  onRowFocus,
  onStartEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onApprove,
  onOpen,
  openBusyId,
}: {
  entry: ScopedMemoryEntry;
  query: string;
  editingId: number | null;
  editValue: string;
  reviewMode: boolean;
  selectionEnabled: boolean;
  selected: boolean;
  focused: boolean;
  selectable: boolean;
  onToggleSelect?: (id: number, opts?: { shift?: boolean; meta?: boolean }) => void;
  onRowFocus?: (id: number) => void;
  onStartEdit: (entry: ScopedMemoryEntry) => void;
  onEditChange: (value: string) => void;
  onSaveEdit: (id: number) => void;
  onCancelEdit: () => void;
  onDelete: (id: number) => void;
  onApprove?: (id: number) => void;
  onOpen?: (entry: ScopedMemoryEntry) => void;
  openBusyId?: number | null;
}) {
  const { t } = useI18n();
  const systemLabelKey = systemMemoryLabelKey(entry);
  const actions = systemLabelKey
    ? [
        {
          id: "delete",
          label: t("memories.deleteAria"),
          onClick: () => onDelete(entry.id),
          destructive: true,
        },
      ]
    : [
        {
          id: "edit",
          label: t("memories.editAria"),
          onClick: () => onStartEdit(entry),
        },
        {
          id: "delete",
          label: t("memories.deleteAria"),
          onClick: () => onDelete(entry.id),
          destructive: true,
        },
      ];

  const handleRowClick = (event: MouseEvent) => {
    if (!selectionEnabled || !selectable || !onToggleSelect) return;
    if ((event.target as HTMLElement).closest("button, input, a, [role='menu']")) return;
    onRowFocus?.(entry.id);
    onToggleSelect(entry.id, { shift: event.shiftKey, meta: event.metaKey || event.ctrlKey });
  };

  const sourceLine = formatMemorySourceLine(entry, t);
  const showOpen = !systemLabelKey && onOpen && memoryMayHaveOpenTarget(entry);

  return (
    <div
      data-memory-row-id={entry.id}
      className={`relative flex items-start gap-3 bg-bg-secondary px-4 py-3 ${
        focused ? "ring-1 ring-inset ring-accent/40" : ""
      }${selected ? " bg-accent/5" : ""}`}
      aria-selected={selectionEnabled && selected ? true : undefined}
      onClick={handleRowClick}
    >
      {selectionEnabled ? (
        <div className="flex shrink-0 items-start pt-0.5">
          <input
            type="checkbox"
            checked={selected}
            disabled={!selectable}
            aria-label={t("memories.rowSelectAria")}
            className="h-4 w-4 rounded border-border accent-accent disabled:opacity-40"
            onChange={(event) => {
              event.stopPropagation();
              const mouse = event.nativeEvent;
              const shift = mouse instanceof MouseEvent ? mouse.shiftKey : false;
              // Checkboxes always add/remove from the current selection (not replace it).
              onToggleSelect?.(entry.id, { shift, meta: true });
            }}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        {editingId === entry.id ? (
          <div className="flex gap-2">
            <input
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveEdit(entry.id);
                if (e.key === "Escape") onCancelEdit();
              }}
              autoFocus
              className="min-w-0 flex-1 rounded border border-border bg-bg-primary px-2 py-1.5 text-sm text-text-primary"
            />
            <button
              type="button"
              onClick={() => onSaveEdit(entry.id)}
              className="rounded bg-button-primary px-2 py-1 text-xs text-white"
            >
              {t("memories.save")}
            </button>
          </div>
        ) : systemLabelKey ? (
          <>
            <p className="text-sm leading-snug text-text-primary">{t(systemLabelKey)}</p>
            <p className="mt-1 text-[11px] text-muted">{t("memories.systemFactBadge")}</p>
          </>
        ) : (
          <>
            <HighlightedValue text={entry.value} query={query} />
            {entry.key && entry.key !== entry.value.slice(0, 48) ? (
              <p className="mt-0.5 truncate text-xs text-muted">{entry.key}</p>
            ) : null}
            {sourceLine ? (
              <p className="mt-1 text-[11px] text-muted">{sourceLine}</p>
            ) : null}
          </>
        )}
      </div>

      {reviewMode && onApprove ? (
        <div className="flex shrink-0 items-start gap-1">
          {showOpen ? (
            <button
              type="button"
              onClick={() => onOpen(entry)}
              disabled={openBusyId === entry.id}
              className="rounded-md border border-border px-2 py-1 text-xs font-medium text-accent hover:bg-bg-primary disabled:opacity-50"
            >
              {openBusyId === entry.id ? t("memories.opening") : t("memories.open")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onApprove(entry.id)}
            className="rounded-md bg-button-primary px-2 py-1 text-xs font-medium text-white hover:bg-button-hover"
          >
            {t("memories.keep")}
          </button>
          <button
            type="button"
            onClick={() => onDelete(entry.id)}
            className="rounded-md px-2 py-1 text-xs text-muted hover:text-red-400"
          >
            {t("memories.discard")}
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-start gap-1">
          {showOpen ? (
            <button
              type="button"
              onClick={() => onOpen(entry)}
              disabled={openBusyId === entry.id}
              className="rounded-md border border-border px-2 py-1 text-xs font-medium text-accent hover:bg-bg-primary disabled:opacity-50"
            >
              {openBusyId === entry.id ? t("memories.opening") : t("memories.open")}
            </button>
          ) : null}
          <RowActionsMenu ariaLabel={t("memories.rowActionsAria")} actions={actions} />
        </div>
      )}
    </div>
  );
}

function GroupHeader({
  group,
  entryIds,
  onSelectGroup,
}: {
  group: MemoryProvenanceGroup;
  entryIds: number[];
  onSelectGroup?: (ids: number[]) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-2 bg-bg-primary/80 px-4 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t(memoryProvenanceGroupLabelKey(group))}
      </span>
      {onSelectGroup ? (
        <button
          type="button"
          onClick={() => onSelectGroup(entryIds)}
          className="text-2xs font-medium text-accent hover:underline"
        >
          {t("memories.selectGroup")}
        </button>
      ) : null}
    </div>
  );
}

export default function MemoryFactsList({
  entries,
  query,
  editingId,
  editValue,
  reviewMode = false,
  groupByProvenance = false,
  selectionEnabled = false,
  selectedIds,
  focusedId = null,
  allVisibleSelected = false,
  someVisibleSelected = false,
  isSelectable,
  onToggleSelect,
  onSelectAllVisible,
  onClearSelection,
  onSelectGroup,
  onRowFocus,
  onStartEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onApprove,
  onOpen,
  openBusyId,
}: Props) {
  const { t } = useI18n();
  const selected = selectedIds ?? new Set<number>();
  const canSelect = (id: number) => (isSelectable ? isSelectable(id) : true);

  const renderRow = (entry: ScopedMemoryEntry) => (
    <MemoryFactRow
      key={entry.id}
      entry={entry}
      query={query}
      editingId={editingId}
      editValue={editValue}
      reviewMode={reviewMode}
      selectionEnabled={selectionEnabled}
      selected={selected.has(entry.id)}
      focused={focusedId === entry.id}
      selectable={canSelect(entry.id)}
      onToggleSelect={onToggleSelect}
      onRowFocus={onRowFocus}
      onStartEdit={onStartEdit}
      onEditChange={onEditChange}
      onSaveEdit={onSaveEdit}
      onCancelEdit={onCancelEdit}
      onDelete={onDelete}
      onApprove={onApprove}
      onOpen={onOpen}
      openBusyId={openBusyId}
    />
  );

  const grouped = groupByProvenance ? groupMemoryEntriesByProvenance(entries) : null;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {selectionEnabled && entries.length > 0 ? (
        <div className="flex items-center gap-3 border-b border-border bg-bg-primary/80 px-4 py-2">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            ref={(el) => {
              if (el) el.indeterminate = someVisibleSelected;
            }}
            aria-label={t("memories.bulkSelectAll")}
            className="h-4 w-4 rounded border-border accent-accent"
            onChange={() => {
              if (allVisibleSelected) onClearSelection?.();
              else onSelectAllVisible?.();
            }}
          />
          <span className="text-xs text-muted">{t("memories.bulkSelectAll")}</span>
        </div>
      ) : null}

      <div className="divide-y divide-border">
        {grouped
          ? grouped.map(({ group, entries: groupEntries }) => (
              <div key={group}>
                <GroupHeader
                  group={group}
                  entryIds={groupEntries.map((e) => e.id)}
                  onSelectGroup={onSelectGroup}
                />
                {groupEntries.map(renderRow)}
              </div>
            ))
          : entries.map(renderRow)}
      </div>
    </div>
  );
}
