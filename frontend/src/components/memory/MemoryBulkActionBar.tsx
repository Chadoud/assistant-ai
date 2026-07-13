import { useI18n } from "../../i18n/I18nContext";

interface MemoryBulkActionBarProps {
  selectedCount: number;
  busy: boolean;
  reviewMode?: boolean;
  onKeep: () => void;
  onDiscard: () => void;
  onClearSelection: () => void;
}

/** Sticky bulk actions when one or more memory rows are selected. */
export default function MemoryBulkActionBar({
  selectedCount,
  busy,
  reviewMode = false,
  onKeep,
  onDiscard,
  onClearSelection,
}: MemoryBulkActionBarProps) {
  const { t } = useI18n();
  if (selectedCount <= 0) return null;

  return (
    <div
      className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-bg-card/95 px-3 py-2.5 shadow-md backdrop-blur-sm"
      role="toolbar"
      aria-label={t("memories.bulkToolbarAria")}
    >
      <span className="text-sm font-medium text-text-primary">
        {t("memories.bulkSelected", { n: selectedCount })}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onKeep}
          className="rounded-lg bg-button-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-button-hover disabled:opacity-50"
        >
          {reviewMode ? t("memories.keep") : t("memories.bulkKeep")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDiscard}
          className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
        >
          {reviewMode ? t("memories.discard") : t("memories.bulkDiscard")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onClearSelection}
          className="rounded-lg px-2 py-1.5 text-xs text-muted hover:text-text-primary disabled:opacity-50"
        >
          {t("memories.bulkClearSelection")}
        </button>
      </div>
    </div>
  );
}
