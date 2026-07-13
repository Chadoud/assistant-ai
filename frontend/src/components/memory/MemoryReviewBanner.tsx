import { useI18n } from "../../i18n/I18nContext";

interface MemoryReviewBannerProps {
  promotionalCount: number;
  selectedCount: number;
  loading: boolean;
  onSelectPromotional: () => void;
  onRemoveSelected: () => void;
}

/** Smart triage hint in the Needs review queue — pre-select promotional rows. */
export default function MemoryReviewBanner({
  promotionalCount,
  selectedCount,
  loading,
  onSelectPromotional,
  onRemoveSelected,
}: MemoryReviewBannerProps) {
  const { t } = useI18n();
  if (promotionalCount <= 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-bg-secondary px-3 py-2.5 text-sm">
      <p className="min-w-0 flex-1 text-text-secondary">
        {t("memories.reviewBannerPromotional", { n: promotionalCount })}
      </p>
      <button
        type="button"
        disabled={loading}
        onClick={onSelectPromotional}
        className="shrink-0 text-xs font-medium text-accent hover:underline disabled:opacity-50"
      >
        {t("memories.reviewBannerSelectPromotional")}
      </button>
      {selectedCount > 0 ? (
        <button
          type="button"
          disabled={loading}
          onClick={onRemoveSelected}
          className="shrink-0 text-xs font-medium text-red-400 hover:underline disabled:opacity-50"
        >
          {t("memories.reviewBannerRemoveSelected")}
        </button>
      ) : null}
    </div>
  );
}
